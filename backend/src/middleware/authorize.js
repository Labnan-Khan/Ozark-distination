import { hasPermission, isAdmin } from '../shared/services/index.js';
import { forbidden, unauthorized } from '../shared/errors/index.js';

export function requireAuth(req, _res, next) {
  if (!req.user) return next(unauthorized());
  next();
}

export function authorize(permission) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    if (!hasPermission(req.user, permission)) return next(forbidden());
    next();
  };
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [req.user.roles];
    if (!roles.some((role) => userRoles.includes(role))) return next(forbidden());
    next();
  };
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(unauthorized());
  if (!isAdmin(req.user)) return next(forbidden('Administrator access required'));
  next();
}
