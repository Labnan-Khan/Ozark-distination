import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { validate } from '../../middleware/validateRequest.js';
import { loginLimiter, passwordResetLimiter } from '../../middleware/rateLimiter.js';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  resetPasswordSchema
} from './auth.validation.js';

const router = Router();

router.post('/register/customer', validate({ body: registerSchema }), authController.registerCustomer);
router.post('/register/owner', validate({ body: registerSchema }), authController.registerOwner);
router.post('/login', loginLimiter, validate({ body: loginSchema }), authController.login);
router.post('/refresh', validate({ body: refreshSchema }), authController.refresh);
router.post('/forgot-password', passwordResetLimiter, validate({ body: forgotPasswordSchema }), authController.forgotPassword);
router.post('/reset-password', validate({ body: resetPasswordSchema }), authController.resetPassword);

router.use(authenticate);
router.post('/logout', authController.logout);
router.post('/logout-all', authController.logoutAll);
router.get('/me', authController.me);

export default router;
