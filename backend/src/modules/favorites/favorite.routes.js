import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { validate } from '../../middleware/validateRequest.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { favoriteController } from './favorite.controller.js';
import {
  addFavoriteSchema,
  favoritePropertyParamSchema,
  favoriteQuerySchema
} from './favorite.validation.js';

const router = Router();
const guard = [authenticate, authorize(PERMISSIONS.FAVORITE_MANAGE_OWN)];

router.post('/', ...guard, validate({ body: addFavoriteSchema }), asyncHandler(favoriteController.add));
router.get('/', ...guard, validate({ query: favoriteQuerySchema }), asyncHandler(favoriteController.list));
router.get('/:propertyId/status', ...guard, validate({ params: favoritePropertyParamSchema }), asyncHandler(favoriteController.status));
router.delete('/:propertyId', ...guard, validate({ params: favoritePropertyParamSchema }), asyncHandler(favoriteController.remove));

export default router;
