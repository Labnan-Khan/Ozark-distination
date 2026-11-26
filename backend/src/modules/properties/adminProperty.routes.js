import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate } from '../../middleware/authenticate.js';
import { requireAdmin } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validateRequest.js';
import { propertyController } from './property.controller.js';
import {
  adminListChangeRequestsQuerySchema,
  adminListDuplicatesQuerySchema,
  adminListPropertiesQuerySchema,
  approveSchema,
  archiveSchema,
  changeRequestIdParamSchema,
  duplicateIdParamSchema,
  duplicateReviewBodySchema,
  lifecycleApproveSchema,
  lifecycleRejectSchema,
  lifecycleRequestIdParamSchema,
  lifecycleRequestListQuerySchema,
  propertyIdParamSchema,
  rejectSchema,
  softDeleteSchema,
  unarchiveSchema,
  changeRequestReviewBodySchema
} from './property.validation.js';

const router = Router();
router.use(authenticate, requireAdmin);

router.get(
  '/',
  validate({ query: adminListPropertiesQuerySchema }),
  asyncHandler(propertyController.getAdminList)
);

router.get(
  '/lifecycle-requests',
  validate({ query: lifecycleRequestListQuerySchema }),
  asyncHandler(propertyController.listAllLifecycleRequests)
);

router.get(
  '/lifecycle-requests/:id',
  validate({ params: lifecycleRequestIdParamSchema }),
  asyncHandler(propertyController.getLifecycleRequest)
);

router.post(
  '/lifecycle-requests/:id/approve',
  validate({ params: lifecycleRequestIdParamSchema, body: lifecycleApproveSchema }),
  asyncHandler(propertyController.approveLifecycleRequest)
);

router.post(
  '/lifecycle-requests/:id/reject',
  validate({ params: lifecycleRequestIdParamSchema, body: lifecycleRejectSchema }),
  asyncHandler(propertyController.rejectLifecycleRequest)
);

router.get(
  '/change-requests',
  validate({ query: adminListChangeRequestsQuerySchema }),
  asyncHandler(propertyController.listAllChangeRequests)
);

router.get(
  '/change-requests/:id',
  validate({ params: changeRequestIdParamSchema }),
  asyncHandler(propertyController.getChangeRequest)
);

router.post(
  '/change-requests/:id/approve',
  validate({ params: changeRequestIdParamSchema, body: changeRequestReviewBodySchema }),
  asyncHandler(propertyController.approveChangeRequest)
);

router.post(
  '/change-requests/:id/reject',
  validate({ params: changeRequestIdParamSchema, body: changeRequestReviewBodySchema }),
  asyncHandler(propertyController.rejectChangeRequest)
);

router.get(
  '/duplicates',
  validate({ query: adminListDuplicatesQuerySchema }),
  asyncHandler(propertyController.listDuplicates)
);

router.post(
  '/duplicates/:id/confirm',
  validate({ params: duplicateIdParamSchema, body: duplicateReviewBodySchema }),
  asyncHandler(propertyController.confirmDuplicate)
);

router.post(
  '/duplicates/:id/dismiss',
  validate({ params: duplicateIdParamSchema, body: duplicateReviewBodySchema }),
  asyncHandler(propertyController.dismissDuplicate)
);

router.get(
  '/:id',
  validate({ params: propertyIdParamSchema }),
  asyncHandler(propertyController.getAdminDetail)
);

router.post(
  '/:id/approve',
  validate({ params: propertyIdParamSchema, body: approveSchema }),
  asyncHandler(propertyController.approve)
);

router.post(
  '/:id/reject',
  validate({ params: propertyIdParamSchema, body: rejectSchema }),
  asyncHandler(propertyController.reject)
);

router.post(
  '/:id/archive',
  validate({ params: propertyIdParamSchema, body: archiveSchema }),
  asyncHandler(propertyController.adminArchive)
);

router.post(
  '/:id/unarchive',
  validate({ params: propertyIdParamSchema, body: unarchiveSchema }),
  asyncHandler(propertyController.unarchive)
);

router.delete(
  '/:id',
  validate({ params: propertyIdParamSchema, body: softDeleteSchema }),
  asyncHandler(propertyController.softDelete)
);

// POST fallback for clients that cannot send a body with DELETE.
router.post(
  '/:id/delete',
  validate({ params: propertyIdParamSchema, body: softDeleteSchema }),
  asyncHandler(propertyController.softDelete)
);

export default router;
