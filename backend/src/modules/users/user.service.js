import mongoose from 'mongoose';
import { ACCOUNT_STATUS, EVENT_TYPES } from '../../shared/constants/index.js';
import { conflict, notFound } from '../../shared/errors/index.js';
import { eventBus } from '../../infrastructure/events/index.js';
import { safeUserDto } from '../../shared/services/index.js';
import { User } from './user.model.js';
import { DeletionRequest } from './deletionRequest.model.js';

export const usersService = {
  async getById(userId) {
    const user = await User.findById(userId);
    if (!user) throw notFound('User not found');
    return user;
  },

  async getProfile(userId) {
    return safeUserDto(await this.getById(userId));
  },

  async getPublicProfile(userId) {
    const user = await User.findOne({ _id: userId, deletedAt: null, accountStatus: ACCOUNT_STATUS.ACTIVE });
    if (!user) return null;
    return {
      id: String(user._id),
      fullName: user.fullName,
      profileMediaId: user.profileMediaId ? String(user.profileMediaId) : null
    };
  },

  async updateProfile(userId, input) {
    const user = await this.getById(userId);
    if (input.email) throw conflict('CHANGE_NOT_ALLOWED', 'Email changes are not enabled in V1');
    if (input.phone !== undefined) user.phone = input.phone || null;
    if (input.fullName !== undefined) user.fullName = input.fullName;
    if (input.preferences !== undefined) user.preferences = { ...(user.preferences || {}), ...input.preferences };
    await user.save();
    return safeUserDto(user);
  },

  async isActive(userId) {
    if (!mongoose.Types.ObjectId.isValid(userId)) return false;
    const user = await User.findById(userId).select('accountStatus deletedAt');
    return Boolean(user && user.accountStatus === ACCOUNT_STATUS.ACTIVE && !user.deletedAt);
  },

  async setStatus(userId, accountStatus, actor, reason = null) {
    const user = await this.getById(userId);
    user.accountStatus = accountStatus;
    user.tokenVersion += 1;
    await user.save();
    const { Session } = await import('../auth/index.js');
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await eventBus.publish({
      type: EVENT_TYPES.USER_SUSPENDED,
      actor: { userId: String(actor._id), role: actor.roles[0] },
      payload: { userId: String(user._id), accountStatus, reason },
      correlationId: actor.correlationId
    });
    return safeUserDto(user);
  },

  async requestDeletion(userId, reason = null, requestedBy = 'user') {
    const { bookingsService } = await import('../bookings/index.js');
    const active = await bookingsService.getActiveBookingsForUser(userId);
    if (active.length && requestedBy === 'user') {
      throw conflict('ACTIVE_BOOKINGS_EXIST', 'Resolve active bookings before requesting deletion');
    }

    const request = await DeletionRequest.create({
      userId,
      requestedBy,
      reason,
      activeBookingCheck: {
        hasActive: active.length > 0,
        bookingIds: active.map((booking) => booking._id),
        checkedAt: new Date()
      }
    });
    await eventBus.publish({
      type: EVENT_TYPES.ACCOUNT_DELETION_REQUESTED,
      actor: { userId: String(userId), role: requestedBy },
      payload: { userId: String(userId), requestId: String(request._id) }
    });
    return request;
  },

  async getDeletionRequest(userId) {
    return DeletionRequest.findOne({ userId }).sort({ createdAt: -1 });
  },

  async clearProfileMedia(userId) {
    const user = await this.getById(userId);
    user.profileMediaId = null;
    await user.save();
    return safeUserDto(user);
  },

  async completeDeletion(userId, actorId = null) {
    const user = await this.getById(userId);
    const tombstoneEmail = `deleted+${user._id}@invalid.example`;
    user.email = tombstoneEmail;
    user.fullName = 'Deleted user';
    user.phone = null;
    user.passwordHash = '!deleted';
    user.accountStatus = ACCOUNT_STATUS.DELETED;
    user.deletedAt = new Date();
    user.deletion.completedAt = new Date();
    user.deletion.anonymizedAt = new Date();
    user.tokenVersion += 1;
    await user.save();

    const { Session } = await import('../auth/index.js');
    await Session.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    await eventBus.publish({
      type: EVENT_TYPES.ACCOUNT_DELETION_RESOLVED,
      actor: { userId: String(actorId || userId), role: 'admin' },
      payload: { userId: String(user._id), status: 'completed' }
    });
    return safeUserDto(user);
  }
};
