import jwt from 'jsonwebtoken';
import { appConfig } from '../config/appConfig.js';
import { User } from '../modules/users/user.model.js';
import { Session } from '../modules/auth/auth.model.js';
import { ACCOUNT_STATUS } from '../shared/constants/index.js';
import { unauthorized } from '../shared/errors/index.js';

export async function authenticate(req, _res, next) {
  try {
    const header = req.header('authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) throw unauthorized();

    let claims;
    try {
      claims = jwt.verify(token, appConfig.jwt.secret);
    } catch {
      throw unauthorized('Invalid or expired access token');
    }

    const user = await User.findById(claims.sub).select('-passwordHash');
    if (!user || user.accountStatus !== ACCOUNT_STATUS.ACTIVE) throw unauthorized('Account is not active');
    if (user.tokenVersion !== claims.ver) throw unauthorized('Session has been invalidated');

    const session = await Session.findOne({ _id: claims.sid, userId: user._id, revokedAt: null });
    if (!session || session.expiresAt <= new Date()) throw unauthorized('Session is no longer valid');

    req.user = user;
    req.session = session;
    req.accessToken = token;
    next();
  } catch (error) {
    next(error);
  }
}

export function optionalAuthenticate(req, _res, next) {
  if (!req.header('authorization')) return next();
  return authenticate(req, _res, next);
}
