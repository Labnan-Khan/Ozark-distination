import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { validate } from '../../middleware/validateRequest.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { objectIdSchema, paginationSchema } from '../../shared/validators/index.js';
import { AUDIT_ENTITY_TYPES } from './auditLog.model.js';
import { auditController } from './audit.controller.js';

const auditQuerySchema = paginationSchema.extend({
  actorId: objectIdSchema.optional(),
  action: z.string().trim().max(120).optional(),
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  entityId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

const router = Router();

router.use(authenticate);
router.use(authorize(PERMISSIONS.AUDIT_READ));
router.get('/audit-logs', validate({ query: auditQuerySchema }), asyncHandler(auditController.list));

export default router;
