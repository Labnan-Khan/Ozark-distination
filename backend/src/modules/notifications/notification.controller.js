import { sendSuccess } from '../../middleware/requestContext.js';
import { notificationsService } from './notification.service.js';

export const notificationController = {
  async list(req, res) {
    const { items, meta } = await notificationsService.list(req.user._id, req.validated?.query || req.query);
    return sendSuccess(res, items, meta);
  },

  async unreadCount(req, res) {
    const count = await notificationsService.unreadCount(req.user._id);
    return sendSuccess(res, { count });
  },

  async markRead(req, res) {
    const notification = await notificationsService.markRead(req.user._id, req.params.id);
    return sendSuccess(res, { notification });
  },

  async markAllRead(req, res) {
    const updatedCount = await notificationsService.markAllRead(req.user._id);
    return sendSuccess(res, { updatedCount });
  }
};
