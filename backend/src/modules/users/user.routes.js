import { Router } from 'express';
import { userController } from './user.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validateRequest.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { singleImage } from '../../middleware/upload.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import { updateProfileSchema, deletionRequestSchema } from './user.validation.js';
import { changePasswordSchema } from '../auth/auth.validation.js';

const router = Router();
router.use(authenticate);

router.get('/me', asyncHandler(userController.getMe));
router.patch('/me', authorize(PERMISSIONS.USER_UPDATE_OWN), validate({ body: updateProfileSchema }), asyncHandler(userController.updateMe));
router.post('/me/change-password', validate({ body: changePasswordSchema }), asyncHandler(userController.changePassword));
router.post('/me/profile-image', singleImage, asyncHandler(userController.uploadProfileImage));
router.delete('/me/profile-image', asyncHandler(userController.removeProfileImage));
router.post('/me/deletion-requests', authorize(PERMISSIONS.USER_DELETE_REQUEST), validate({ body: deletionRequestSchema }), asyncHandler(userController.requestDeletion));
router.get('/me/deletion-requests', asyncHandler(userController.getDeletionRequest));

export default router;
