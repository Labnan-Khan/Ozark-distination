import pino from 'pino';
import { env } from '../../config/environment.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.NODE_ENV === 'production' ? 'info' : 'debug',
  redact: {
    paths: [
      'password',
      'newPassword',
      'currentPassword',
      'refreshToken',
      'token',
      'passwordHash',
      'req.headers.authorization',
      'req.headers.cookie'
    ],
    censor: '[REDACTED]'
  },
  base: { service: 'property-rental-api', env: env.NODE_ENV }
});

export const requestLogger = (req, res, next) => {
  const started = Date.now();
  res.on('finish', () => {
    logger.info({
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - started,
      actorId: req.user?._id?.toString() || null
    }, 'request completed');
  });
  next();
};
