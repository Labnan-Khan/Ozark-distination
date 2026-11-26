import { forbidden } from '../../shared/errors/index.js';
import { isAdmin } from '../../shared/services/index.js';
import { sendSuccess } from '../../middleware/requestContext.js';
import { categoriesService } from './category.service.js';

export const categoryController = {
  async list(req, res) {
    if (req.query.includeInactive && !isAdmin(req.user)) {
      throw forbidden('Administrator access required to include inactive categories');
    }
    const categories = await categoriesService.listActive(req.query);
    return sendSuccess(res, { categories });
  },

  async getById(req, res) {
    const category = await categoriesService.getById(req.params.id);
    return sendSuccess(res, { category });
  },

  async create(req, res) {
    const category = await categoriesService.create(req.body, req.user);
    return sendSuccess(res, { category }, undefined, 201);
  },

  async update(req, res) {
    const category = await categoriesService.update(req.params.id, req.body, req.user);
    return sendSuccess(res, { category });
  },

  async deactivate(req, res) {
    const category = await categoriesService.deactivate(req.params.id, req.user);
    return sendSuccess(res, { category });
  }
};
