import { forbidden } from '../../shared/errors/index.js';
import { isAdmin } from '../../shared/services/index.js';
import { sendSuccess } from '../../middleware/requestContext.js';
import { amenitiesService } from './amenity.service.js';

export const amenityController = {
  async list(req, res) {
    if (req.query.includeInactive && !isAdmin(req.user)) {
      throw forbidden('Administrator access required to include inactive amenities');
    }
    const amenities = await amenitiesService.listActive(req.query);
    return sendSuccess(res, { amenities });
  },

  async create(req, res) {
    const amenity = await amenitiesService.create(req.body, req.user);
    return sendSuccess(res, { amenity }, undefined, 201);
  },

  async update(req, res) {
    const amenity = await amenitiesService.update(req.params.id, req.body, req.user);
    return sendSuccess(res, { amenity });
  },

  async deactivate(req, res) {
    const amenity = await amenitiesService.deactivate(req.params.id, req.user);
    return sendSuccess(res, { amenity });
  }
};
