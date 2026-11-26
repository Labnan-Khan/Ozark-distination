import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { appConfig } from '../../config/appConfig.js';
import { withTransaction } from '../../config/database.js';
import { ACCOUNT_STATUS, EVENT_TYPES, ROLES } from '../../shared/constants/index.js';
import { ApiError, badRequest, conflict, unauthorized } from '../../shared/errors/index.js';
import { hashToken, normalizeEmail, randomToken, generateResetToken } from '../../shared/utils/index.js';
import { safeUserDto } from '../../shared/services/index.js';
import { eventBus } from '../../infrastructure/events/index.js';
import { jobQueue } from '../../infrastructure/jobs/index.js';
import { renderEmail } from '../../infrastructure/email/index.js';
import { User } from '../users/user.model.js';
import { PasswordResetToken, Session } from './auth.model.js';

const RESET_TTL_MS = 30 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

function signAccessToken(user, session) {
  return jwt.sign(
    {
      sub: String(user._id),
      roles: user.roles,
      sid: String(session._id),
      ver: user.tokenVersion
    },
    appConfig.jwt.secret,
    { expiresIn: appConfig.jwt.accessTtl }
  );
}

async function createSession(user, meta = {}, session = null) {
  const refreshToken = randomToken(40);
  const familyId = new mongoose.Types.ObjectId();
  const [created] = await Session.create([{
    userId: user._id,
    refreshTokenHash: hashToken(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + appConfig.jwt.refreshTtlDays * 24 * 60 * 60 * 1000),
    ip: meta.ip || null,
    userAgent: meta.userAgent || null,
    lastUsedAt: new Date()
  }], session ? { session } : undefined);
  return { session: created, refreshToken };
}

function tokenPair(user, session, refreshToken) {
  return {
    accessToken: signAccessToken(user, session),
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: appConfig.jwt.accessTtl
  };
}

async function publishUserEvent(type, user, actor, payload = {}, correlationId = null, session = null) {
  await eventBus.publish({
    type,
    actor: actor ? { userId: String(actor._id || actor), role: actor.roles?.[0] } : null,
    payload: { userId: String(user._id), ...payload },
    correlationId
  }, session);
}

export const authService = {
  async register(input, role, meta = {}) {
    const email = normalizeEmail(input.email);
    if (await User.exists({ email })) throw conflict('EMAIL_IN_USE', 'An account with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, appConfig.security.bcryptRounds);
    const result = await withTransaction(async (dbSession) => {
      const [user] = await User.create([{
        roles: [role],
        fullName: input.fullName.trim(),
        email,
        passwordHash,
        phone: input.phone || null
      }], { session: dbSession });

      const { session, refreshToken } = await createSession(user, meta, dbSession);
      await publishUserEvent(EVENT_TYPES.USER_REGISTERED, user, user, { role }, meta.correlationId, dbSession);
      await jobQueue.sendEmail(
        {
          to: user.email,
          ...renderEmail('welcome', { fullName: user.fullName })
        },
        { correlationId: meta.correlationId, idempotencyKey: `welcome:${user._id}`, session: dbSession }
      );
      return { user, session, refreshToken };
    });

    return {
      user: safeUserDto(result.user),
      tokens: tokenPair(result.user, result.session, result.refreshToken)
    };
  },

  async login(input, meta = {}) {
    const email = normalizeEmail(input.email);
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) throw unauthorized('Invalid email or password');

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new ApiError(423, 'ACCOUNT_LOCKED', 'Account temporarily locked. Try again later.');
    }
    if (user.accountStatus !== ACCOUNT_STATUS.ACTIVE) throw unauthorized('Account is not active');

    const matched = await bcrypt.compare(input.password, user.passwordHash);
    if (!matched) {
      const attempts = (user.failedLoginAttempts || 0) + 1;
      user.failedLoginAttempts = attempts;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        user.lockedUntil = new Date(Date.now() + LOCK_MS);
        user.failedLoginAttempts = 0;
      }
      await user.save();
      throw unauthorized('Invalid email or password');
    }

    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
    user.lastLoginAt = new Date();

    const { session, refreshToken } = await createSession(user, meta);
    await user.save();
    await publishUserEvent('UserLoggedIn', user, user, {}, meta.correlationId);
    return { user: safeUserDto(user), tokens: tokenPair(user, session, refreshToken) };
  },

  async refresh(input, meta = {}) {
    if (!input.refreshToken) throw unauthorized('Refresh token required');
    const tokenHash = hashToken(input.refreshToken);
    const session = await Session.findOne({ refreshTokenHash: tokenHash }).select('+refreshTokenHash');
    if (!session) throw unauthorized('Invalid refresh token');

    if (session.revokedAt) {
      await Session.updateMany(
        { familyId: session.familyId, revokedAt: null },
        { $set: { revokedAt: new Date() } }
      );
      throw unauthorized('Refresh token reuse detected');
    }
    if (session.expiresAt <= new Date()) throw unauthorized('Refresh token expired');

    const user = await User.findById(session.userId);
    if (!user || user.accountStatus !== ACCOUNT_STATUS.ACTIVE) throw unauthorized('Account is not active');

    const { session: newSession, refreshToken } = await createSession(user, meta);
    newSession.familyId = session.familyId;
    await newSession.save();
    session.revokedAt = new Date();
    session.replacedById = newSession._id;
    await session.save();

    return tokenPair(user, newSession, refreshToken);
  },

  async logout(sessionId) {
    if (sessionId) await Session.updateOne({ _id: sessionId }, { $set: { revokedAt: new Date() } });
    return true;
  },

  async logoutAll(userId) {
    const result = await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    return { revokedCount: result.modifiedCount };
  },

  async forgotPassword(input, meta = {}) {
    const email = normalizeEmail(input.email);
    const user = await User.findOne({ email });
    if (!user) return { accepted: true };

    const rawToken = generateResetToken();
    await PasswordResetToken.create({
      userId: user._id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
      requestedIp: meta.ip || null
    });

    const resetUrl = `${meta.clientUrl || 'http://localhost:5173'}/reset-password?token=${encodeURIComponent(rawToken)}`;
    await publishUserEvent(EVENT_TYPES.PASSWORD_RESET_REQUESTED, user, null, {}, meta.correlationId);
    await jobQueue.sendEmail(
      {
        to: user.email,
        ...renderEmail('passwordReset', { resetUrl })
      },
      { correlationId: meta.correlationId, idempotencyKey: `reset:${rawToken}` }
    );
    return { accepted: true };
  },

  async resetPassword(input, meta = {}) {
    const tokenHash = hashToken(input.token);
    const record = await PasswordResetToken.findOne({ tokenHash, usedAt: null }).select('+tokenHash');
    if (!record || record.expiresAt <= new Date()) throw badRequest('Invalid or expired reset token');

    const passwordHash = await bcrypt.hash(input.newPassword, appConfig.security.bcryptRounds);
    const user = await User.findById(record.userId).select('+passwordHash');
    if (!user) throw badRequest('Invalid reset token');

    user.passwordHash = passwordHash;
    user.tokenVersion += 1;
    await user.save();

    record.usedAt = new Date();
    await record.save();
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await publishUserEvent(EVENT_TYPES.PASSWORD_CHANGED, user, user, {}, meta.correlationId);
    return { reset: true };
  },

  async changePassword(userId, input, meta = {}) {
    const user = await User.findById(userId).select('+passwordHash');
    if (!user) throw unauthorized();
    const matched = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!matched) throw badRequest('Current password is incorrect');

    user.passwordHash = await bcrypt.hash(input.newPassword, appConfig.security.bcryptRounds);
    user.tokenVersion += 1;
    await user.save();
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await publishUserEvent(EVENT_TYPES.PASSWORD_CHANGED, user, user, {}, meta.correlationId);
    return { changed: true };
  },

  async createAdminAccount(input, actor, meta = {}) {
    const email = normalizeEmail(input.email);
    if (await User.exists({ email })) throw conflict('EMAIL_IN_USE', 'An account with this email already exists');

    const passwordHash = await bcrypt.hash(input.password, appConfig.security.bcryptRounds);
    const user = await User.create({
      roles: [ROLES.ADMIN],
      fullName: input.fullName.trim(),
      email,
      passwordHash,
      phone: input.phone || null
    });
    await publishUserEvent(EVENT_TYPES.ADMIN_CREATED, user, actor, {}, meta.correlationId);
    return safeUserDto(user);
  },

  async verifyAccessTokenPayload(claims) {
    const user = await User.findById(claims.sub);
    return Boolean(user && user.tokenVersion === claims.ver);
  },

  roleFromEndpoint(path) {
    return path.includes('owner') ? ROLES.OWNER : ROLES.CUSTOMER;
  }
};
