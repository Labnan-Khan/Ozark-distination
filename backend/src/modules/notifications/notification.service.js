import mongoose from 'mongoose';
import { badRequest, notFound } from '../../shared/errors/index.js';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/index.js';
import { Notification } from './notification.model.js';

function ensureObjectId(value, field) {
  if (!mongoose.Types.ObjectId.isValid(value)) throw badRequest(`Invalid ${field}`);
  return value instanceof mongoose.Types.ObjectId ? value : new mongoose.Types.ObjectId(String(value));
}

export function notificationDto(document) {
  const source = typeof document?.toObject === 'function' ? document.toObject() : document;
  if (!source) return null;
  return {
    id: String(source._id),
    userId: String(source.userId),
    type: source.type,
    title: source.title,
    body: source.body,
    data: source.data || {},
    isRead: Boolean(source.isRead),
    readAt: source.readAt || null,
    delivery: source.delivery || { inApp: true, email: 'not_requested' },
    priority: source.priority || 'normal',
    eventId: source.eventId || null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

export const notificationsService = {
  async createInApp({ userId, type, title, body, data = {}, eventId = null, priority = 'normal' }) {
    const recipient = ensureObjectId(userId, 'user id');
    const values = {
      userId: recipient,
      type,
      title,
      body,
      data: data || {},
      isRead: false,
      readAt: null,
      delivery: { inApp: true, email: 'not_requested' },
      priority,
      eventId
    };

    if (eventId) {
      const key = String(eventId);
      try {
        const document = await Notification.findOneAndUpdate(
          { userId: recipient, eventId: key },
          { $setOnInsert: { ...values, eventId: key } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
        return notificationDto(document);
      } catch (error) {
        if (error?.code === 11000) {
          const existing = await Notification.findOne({ userId: recipient, eventId: key });
          if (existing) return notificationDto(existing);
        }
        throw error;
      }
    }

    const document = await Notification.create(values);
    return notificationDto(document);
  },

  async list(userId, { page, limit, unreadOnly = false, sort } = {}) {
    const recipient = ensureObjectId(userId, 'user id');
    const { page: currentPage, limit: currentLimit, skip } = parsePagination({ page, limit });
    const filter = { userId: recipient };
    if (unreadOnly) filter.isRead = false;

    const sortSpec = sort === 'createdAt' ? { createdAt: 1 } : { createdAt: -1 };
    const [documents, total] = await Promise.all([
      Notification.find(filter).sort(sortSpec).skip(skip).limit(currentLimit).lean(),
      Notification.countDocuments(filter)
    ]);

    return {
      items: documents.map(notificationDto),
      meta: buildPaginationMeta({ page: currentPage, limit: currentLimit, total })
    };
  },

  async unreadCount(userId) {
    const recipient = ensureObjectId(userId, 'user id');
    return Notification.countDocuments({ userId: recipient, isRead: false });
  },

  async markRead(userId, id) {
    const recipient = ensureObjectId(userId, 'user id');
    const notificationId = ensureObjectId(id, 'notification id');
    const document = await Notification.findOne({ _id: notificationId, userId: recipient });
    if (!document) throw notFound('Notification not found');
    if (!document.isRead) {
      document.isRead = true;
      document.readAt = new Date();
      await document.save();
    }
    return notificationDto(document);
  },

  async markAllRead(userId) {
    const recipient = ensureObjectId(userId, 'user id');
    const result = await Notification.updateMany(
      { userId: recipient, isRead: false },
      { $set: { isRead: true, readAt: new Date() } }
    );
    return result.modifiedCount ?? 0;
  }
};
