export class ApiError extends Error {
  constructor(statusCode, code, message, details = []) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, ApiError);
  }
}

export const badRequest = (message = 'Invalid request', details = []) => new ApiError(400, 'VALIDATION_ERROR', message, details);
export const unauthorized = (message = 'Authentication required') => new ApiError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You are not allowed to perform this action') => new ApiError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Resource not found') => new ApiError(404, 'NOT_FOUND', message);
export const conflict = (code, message) => new ApiError(409, code, message);
export const tooMany = (message = 'Too many requests') => new ApiError(429, 'RATE_LIMITED', message);
export const invalidState = (message = 'Invalid state transition') => new ApiError(400, 'INVALID_STATE_TRANSITION', message);

export function mapDatabaseError(error) {
  if (error?.name === 'ValidationError') {
    const details = Object.values(error.errors || {}).map((item) => ({
      field: item.path,
      message: item.message
    }));
    return badRequest('Validation failed', details);
  }
  if (error?.code === 11000) {
    const fields = Object.keys(error.keyPattern || {});
    return conflict('DUPLICATE_RESOURCE', `${fields.join(', ') || 'Resource'} already exists`);
  }
  if (error?.name === 'CastError') {
    return badRequest(`Invalid value for ${error.path}`);
  }
  return error;
}
