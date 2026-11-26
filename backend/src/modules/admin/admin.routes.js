import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize, requireAdmin } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validateRequest.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { adminController } from './admin.controller.js';
import {
  approveSchema,
  auditLogQuerySchema,
  bookingReportQuerySchema,
  createAdminSchema,
  directDeleteSchema,
  idParamSchema,
  listDeletionRequestsQuerySchema,
  listUsersQuerySchema,
  rejectSchema,
  settingKeyParamSchema,
  settingUpdateSchema,
  statusUpdateSchema
} from './admin.validation.js';

const router = Router();

router.use(authenticate, requireAdmin);

router.get(
  '/users',
  authorize(PERMISSIONS.USER_READ_ANY),
  validate({ query: listUsersQuerySchema }),
  asyncHandler(adminController.listUsers)
);
router.post(
  '/users',
  authorize(PERMISSIONS.ADMIN_CREATE),
  validate({ body: createAdminSchema }),
  asyncHandler(adminController.createAdmin)
);
router.get(
  '/users/:id',
  authorize(PERMISSIONS.USER_READ_ANY),
  validate({ params: idParamSchema }),
  asyncHandler(adminController.getUserById)
);
router.patch(
  '/users/:id/status',
  authorize(PERMISSIONS.USER_SUSPEND_ANY),
  validate({ params: idParamSchema, body: statusUpdateSchema }),
  asyncHandler(adminController.updateUserStatus)
);
router.post(
  '/users/:id/delete',
  authorize(PERMISSIONS.USER_DELETE_ANY),
  validate({ params: idParamSchema, body: directDeleteSchema }),
  asyncHandler(adminController.directDelete)
);

router.get(
  '/deletion-requests',
  authorize(PERMISSIONS.DELETION_REVIEW_ANY),
  validate({ query: listDeletionRequestsQuerySchema }),
  asyncHandler(adminController.listDeletionRequests)
);
router.post(
  '/deletion-requests/:id/approve',
  authorize(PERMISSIONS.DELETION_REVIEW_ANY),
  validate({ params: idParamSchema, body: approveSchema }),
  asyncHandler(adminController.approveDeletionRequest)
);
router.post(
  '/deletion-requests/:id/reject',
  authorize(PERMISSIONS.DELETION_REVIEW_ANY),
  validate({ params: idParamSchema, body: rejectSchema }),
  asyncHandler(adminController.rejectDeletionRequest)
);

router.get(
  '/audit-logs',
  authorize(PERMISSIONS.AUDIT_READ),
  validate({ query: auditLogQuerySchema }),
  asyncHandler(adminController.getAuditLogs)
);

router.get(
  '/settings',
  authorize(PERMISSIONS.SETTINGS_READ),
  asyncHandler(adminController.getSettings)
);
router.patch(
  '/settings/:key',
  authorize(PERMISSIONS.SETTINGS_MANAGE),
  validate({ params: settingKeyParamSchema, body: settingUpdateSchema }),
  asyncHandler(adminController.updateSetting)
);

router.get(
  '/reports/bookings',
  authorize(PERMISSIONS.REPORT_READ),
  validate({ query: bookingReportQuerySchema }),
  asyncHandler(adminController.bookingReport)
);

export default router;
