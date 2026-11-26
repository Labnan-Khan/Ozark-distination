import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { authenticate, optionalAuthenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validateRequest.js';
import { multipleImages } from '../../middleware/upload.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { propertyController } from './property.controller.js';
import {
  approvalHistoryQuerySchema,
  archiveSchema,
  availabilityQuerySchema,
  blockDatesSchema,
  changeRequestQuerySchema,
  lifecycleRequestCreateSchema,
  lifecycleRequestListQuerySchema,
  mediaParamSchema,
  mediaPatchSchema,
  propertyIdParamSchema,
  reservationParamSchema,
  submitSchema,
  updatePropertySchema,
  createPropertySchema,
  listPropertiesQuerySchema
} from './property.validation.js';

const router = Router();

router.post(
  '/',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_CREATE_OWN),
  validate({ body: createPropertySchema }),
  asyncHandler(propertyController.create)
);

router.get(
  '/me',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_READ_OWN),
  validate({ query: listPropertiesQuerySchema }),
  asyncHandler(propertyController.listMine)
);

router.get(
  '/me/lifecycle-requests',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_LIFECYCLE_REQUEST_OWN),
  validate({ query: lifecycleRequestListQuerySchema }),
  asyncHandler(propertyController.listMyLifecycleRequests)
);

router.get(
  '/:id',
  optionalAuthenticate,
  validate({ params: propertyIdParamSchema }),
  asyncHandler(propertyController.getById)
);

router.patch(
  '/:id',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_UPDATE_OWN),
  validate({ params: propertyIdParamSchema, body: updatePropertySchema }),
  asyncHandler(propertyController.update)
);

router.post(
  '/:id/submit',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_SUBMIT),
  validate({ params: propertyIdParamSchema, body: submitSchema }),
  asyncHandler(propertyController.submit)
);

router.post(
  '/:id/publish',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_PUBLISH),
  validate({ params: propertyIdParamSchema }),
  asyncHandler(propertyController.publish)
);

router.post(
  '/:id/archive',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_ARCHIVE_OWN),
  validate({ params: propertyIdParamSchema, body: archiveSchema }),
  asyncHandler(propertyController.archive)
);

router.post(
  '/:id/delete-request',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_LIFECYCLE_REQUEST_OWN),
  validate({ params: propertyIdParamSchema, body: lifecycleRequestCreateSchema }),
  asyncHandler(propertyController.requestDelete)
);

router.get(
  '/:id/lifecycle-requests',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_LIFECYCLE_REQUEST_OWN),
  validate({ params: propertyIdParamSchema, query: lifecycleRequestListQuerySchema }),
  asyncHandler(propertyController.getLifecycleRequests)
);

router.get(
  '/:id/availability',
  validate({ params: propertyIdParamSchema, query: availabilityQuerySchema }),
  asyncHandler(propertyController.getAvailability)
);

router.post(
  '/:id/blocks',
  authenticate,
  authorize(PERMISSIONS.AVAILABILITY_MANAGE_OWN),
  validate({ params: propertyIdParamSchema, body: blockDatesSchema }),
  asyncHandler(propertyController.blockDates)
);

router.delete(
  '/:id/blocks/:reservationId',
  authenticate,
  authorize(PERMISSIONS.AVAILABILITY_MANAGE_OWN),
  validate({ params: reservationParamSchema }),
  asyncHandler(propertyController.unblock)
);

router.post(
  '/:id/media',
  authenticate,
  authorize(PERMISSIONS.MEDIA_MANAGE_OWN),
  validate({ params: propertyIdParamSchema }),
  multipleImages,
  asyncHandler(propertyController.attachMedia)
);

router.patch(
  '/:id/media/:mediaId',
  authenticate,
  authorize(PERMISSIONS.MEDIA_MANAGE_OWN),
  validate({ params: mediaParamSchema, body: mediaPatchSchema }),
  asyncHandler(propertyController.patchMedia)
);

router.delete(
  '/:id/media/:mediaId',
  authenticate,
  authorize(PERMISSIONS.MEDIA_MANAGE_OWN),
  validate({ params: mediaParamSchema }),
  asyncHandler(propertyController.removeMedia)
);

router.get(
  '/:id/change-requests',
  authenticate,
  authorize(PERMISSIONS.CHANGE_REQUEST_READ_OWN),
  validate({ params: propertyIdParamSchema, query: changeRequestQuerySchema }),
  asyncHandler(propertyController.getChangeRequests)
);

router.get(
  '/:id/approval-history',
  authenticate,
  authorize(PERMISSIONS.PROPERTY_READ_OWN),
  validate({ params: propertyIdParamSchema, query: approvalHistoryQuerySchema }),
  asyncHandler(propertyController.getApprovalHistory)
);

export default router;
