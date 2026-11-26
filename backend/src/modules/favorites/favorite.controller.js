import { sendSuccess } from '../../middleware/requestContext.js';
import { favoritesService } from './favorite.service.js';

export const favoriteController = {
  async add(req, res) {
    const favorite = await favoritesService.add(req.user._id, req.body.propertyId);
    return sendSuccess(res, { favorite }, undefined, 201);
  },

  async remove(req, res) {
    await favoritesService.remove(req.user._id, req.params.propertyId);
    return res.status(204).end();
  },

  async list(req, res) {
    const { items, meta } = await favoritesService.list(req.user._id, req.query);
    return sendSuccess(res, { properties: items, items, meta });
  },

  async status(req, res) {
    const status = await favoritesService.status(req.user._id, req.params.propertyId);
    return sendSuccess(res, status);
  }
};
