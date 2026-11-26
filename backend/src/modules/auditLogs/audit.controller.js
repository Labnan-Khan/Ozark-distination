import { sendSuccess } from '../../middleware/requestContext.js';
import { auditService } from './audit.service.js';

export const auditController = {
  async list(req, res) {
    const { items, meta } = await auditService.query(
      req.validated?.query || req.query,
      req.validated?.query || req.query
    );
    return sendSuccess(res, items, meta);
  }
};
