import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validateRequest.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { objectIdSchema } from '../../shared/validators/index.js';
import { notificationController } from './notification.controller.js';

const booleanFromQuery = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes'].includes(normalized)) return true;
  if (['false', '0', 'no', ''].includes(normalized)) return false;
  return value;
}, z.boolean().default(false));

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  unreadOnly: booleanFromQuery,
  sort: z.string().optional()
});

const idParamSchema = z.object({ id: objectIdSchema }).strict();

const router = Router();

router.use(authenticate);
router.use(authorize(PERMISSIONS.NOTIFICATION_READ_OWN));

router.get('/', validate({ query: listQuerySchema }), asyncHandler(notificationController.list));
router.get('/unread-count', asyncHandler(notificationController.unreadCount));
router.patch('/read-all', asyncHandler(notificationController.markAllRead));
router.patch('/:id/read', validate({ params: idParamSchema }), asyncHandler(notificationController.markRead));

export default router;
