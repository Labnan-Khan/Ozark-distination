import crypto from 'node:crypto';
import { isProduction } from '../config/environment.js';

export function requestContext(req, res, next) {
  req.requestId = req.header('x-request-id') || crypto.randomUUID();
  req.correlationId = req.header('x-correlation-id') || req.requestId;
  res.setHeader('x-request-id', req.requestId);
  if (!isProduction) res.setHeader('access-control-expose-headers', 'x-request-id');
  next();
}

export const sendSuccess = (res, data, meta, statusCode = 200) => {
  const payload = { success: true, data };
  if (meta) payload.meta = meta;
  return res.status(statusCode).json(payload);
};
