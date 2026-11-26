import { ApiError, mapDatabaseError } from '../shared/errors/index.js';
import { isProduction } from '../config/environment.js';
import { logger } from '../infrastructure/logging/index.js';

export function notFoundHandler(req, _res, next) {
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
}

export function errorHandler(error, req, res, _next) {
  const mapped = mapDatabaseError(error);

  if (!(mapped instanceof ApiError)) {
    logger.error({
      err: mapped,
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl
    }, 'unhandled error');
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong',
        requestId: req.requestId
      }
    });
  }

  if (mapped.statusCode >= 500) {
    logger.error({ err: mapped, requestId: req.requestId }, mapped.message);
  }

  return res.status(mapped.statusCode).json({
    success: false,
    error: {
      code: mapped.code,
      message: mapped.message,
      details: mapped.details || [],
      requestId: req.requestId,
      ...(isProduction ? {} : { stack: mapped.stack })
    }
  });
}
