import rateLimit from 'express-rate-limit';
import { appConfig } from '../config/appConfig.js';

export const globalLimiter = rateLimit({
  windowMs: appConfig.security.rateLimit.windowMs,
  limit: appConfig.security.rateLimit.max,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests' } }
});

export const loginLimiter = rateLimit({
  windowMs: appConfig.security.rateLimit.windowMs,
  limit: appConfig.security.loginRateMax,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many login attempts' } }
});

export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.ip}:${String(req.body?.email || '').toLowerCase()}`,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many password reset requests' } }
});
