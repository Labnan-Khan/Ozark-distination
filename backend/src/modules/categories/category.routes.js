import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { validate } from '../../middleware/validateRequest.js';
import { categoryController } from './category.controller.js';
import {
  categoryIdParamSchema,
  categoryQuerySchema,
  createCategorySchema,
  updateCategorySchema
} from './category.validation.js';

const router = Router();

router.get('/categories', validate({ query: categoryQuerySchema }), asyncHandler(categoryController.list));
router.get('/categories/:id', validate({ params: categoryIdParamSchema }), asyncHandler(categoryController.getById));

router.post(
  '/admin/categories',
  authenticate,
  authorize(PERMISSIONS.CATEGORY_MANAGE),
  validate({ body: createCategorySchema }),
  asyncHandler(categoryController.create)
);
router.patch(
  '/admin/categories/:id',
  authenticate,
  authorize(PERMISSIONS.CATEGORY_MANAGE),
  validate({ params: categoryIdParamSchema, body: updateCategorySchema }),
  asyncHandler(categoryController.update)
);
router.post(
  '/admin/categories/:id/deactivate',
  authenticate,
  authorize(PERMISSIONS.CATEGORY_MANAGE),
  validate({ params: categoryIdParamSchema }),
  asyncHandler(categoryController.deactivate)
);

export default router;
