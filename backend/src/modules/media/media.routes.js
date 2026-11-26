import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { singleImage } from '../../middleware/upload.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { mediaController } from './media.controller.js';

const router = Router();

router.use(authenticate);
router.post(
  '/profile',
  authorize(PERMISSIONS.MEDIA_MANAGE_OWN),
  singleImage,
  asyncHandler(mediaController.uploadProfile)
);
router.delete(
  '/profile',
  authorize(PERMISSIONS.MEDIA_MANAGE_OWN),
  asyncHandler(mediaController.removeProfile)
);

export default router;
