import { badRequest } from '../../shared/errors/index.js';
import { authService } from '../auth/index.js';
import { usersService } from './user.service.js';
import { sendSuccess } from '../../middleware/requestContext.js';

export const userController = {
  async getMe(req, res) {
    return sendSuccess(res, { user: await usersService.getProfile(req.user._id) });
  },

  async updateMe(req, res) {
    return sendSuccess(res, { user: await usersService.updateProfile(req.user._id, req.body) });
  },

  async changePassword(req, res) {
    const result = await authService.changePassword(req.user._id, req.body, { correlationId: req.correlationId });
    return sendSuccess(res, result);
  },

  async uploadProfileImage(req, res) {
    if (!req.file) throw badRequest('Image file is required');
    const { mediaService } = await import('../media/index.js');
    const media = await mediaService.attach(
      { type: 'user', id: req.user._id },
      [req.file],
      { _id: req.user._id, roles: req.user.roles },
      req.correlationId
    );
    return sendSuccess(res, { media: media[0] }, undefined, 201);
  },

  async removeProfileImage(req, res) {
    const { mediaService } = await import('../media/index.js');
    await mediaService.removeCurrentProfileImage(req.user._id);
    return res.status(204).end();
  },

  async requestDeletion(req, res) {
    const request = await usersService.requestDeletion(req.user._id, req.body.reason || null);
    return sendSuccess(res, { request }, undefined, 201);
  },

  async getDeletionRequest(req, res) {
    const request = await usersService.getDeletionRequest(req.user._id);
    return sendSuccess(res, { request });
  }
};
