import { badRequest } from '../../shared/errors/index.js';
import { sendSuccess } from '../../middleware/requestContext.js';
import { mediaService } from './media.service.js';

export const mediaController = {
  async uploadProfile(req, res) {
    if (!req.file) throw badRequest('Image file is required');
    const media = await mediaService.attach(
      { type: 'user', id: req.user._id },
      [req.file],
      { _id: req.user._id, roles: req.user.roles },
      req.correlationId
    );
    return sendSuccess(res, { media: media[0] }, undefined, 201);
  },

  async removeProfile(req, res) {
    await mediaService.removeCurrentProfileImage(req.user._id);
    return res.status(204).end();
  }
};
