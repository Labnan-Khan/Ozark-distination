import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { validate } from '../../middleware/validateRequest.js';
import { amenityController } from './amenity.controller.js';
import {
  amenityIdParamSchema,
  amenityQuerySchema,
  createAmenitySchema,
  updateAmenitySchema
} from './amenity.validation.js';

const router = Router();

router.get('/amenities', validate({ query: amenityQuerySchema }), asyncHandler(amenityController.list));

router.post(
  '/admin/amenities',
  authenticate,
  authorize(PERMISSIONS.AMENITY_MANAGE),
  validate({ body: createAmenitySchema }),
  asyncHandler(amenityController.create)
);
router.patch(
  '/admin/amenities/:id',
  authenticate,
  authorize(PERMISSIONS.AMENITY_MANAGE),
  validate({ params: amenityIdParamSchema, body: updateAmenitySchema }),
  asyncHandler(amenityController.update)
);
router.post(
  '/admin/amenities/:id/deactivate',
  authenticate,
  authorize(PERMISSIONS.AMENITY_MANAGE),
  validate({ params: amenityIdParamSchema }),
  asyncHandler(amenityController.deactivate)
);

export default router;
