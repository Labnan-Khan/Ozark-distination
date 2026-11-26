import { env } from '../../config/environment.js';
import { authService } from './auth.service.js';
import { ROLES } from '../../shared/constants/index.js';
import { permissionsFor, safeUserDto } from '../../shared/services/index.js';
import { sendSuccess } from '../../middleware/requestContext.js';

const meta = (req) => ({
  ip: req.ip,
  userAgent: req.header('user-agent'),
  correlationId: req.correlationId,
  clientUrl: req.header('x-client-url') || env.CLIENT_URL
});

export const authController = {
  async registerCustomer(req, res) {
    const result = await authService.register(req.body, ROLES.CUSTOMER, meta(req));
    return sendSuccess(res, result, undefined, 201);
  },

  async registerOwner(req, res) {
    const result = await authService.register(req.body, ROLES.OWNER, meta(req));
    return sendSuccess(res, result, undefined, 201);
  },

  async login(req, res) {
    const result = await authService.login(req.body, meta(req));
    return sendSuccess(res, result);
  },

  async refresh(req, res) {
    const tokens = await authService.refresh(req.body, meta(req));
    return sendSuccess(res, tokens);
  },

  async logout(req, res) {
    await authService.logout(req.session?._id);
    return res.status(204).end();
  },

  async logoutAll(req, res) {
    const result = await authService.logoutAll(req.user._id);
    return sendSuccess(res, result);
  },

  async forgotPassword(req, res) {
    const result = await authService.forgotPassword(req.body, meta(req));
    return sendSuccess(res, result, undefined, 202);
  },

  async resetPassword(req, res) {
    const result = await authService.resetPassword(req.body, meta(req));
    return sendSuccess(res, result);
  },

  async me(req, res) {
    return sendSuccess(res, {
      user: safeUserDto(req.user),
      permissions: permissionsFor(req.user)
    });
  }
};
