import { ROLE_PERMISSIONS, ROLES } from '../constants/index.js';

export function permissionsFor(user) {
  if (!user) return [];
  const roles = Array.isArray(user.roles) ? user.roles : [user.roles];
  const base = roles.flatMap((role) => ROLE_PERMISSIONS[role] || []);
  const grants = Array.isArray(user.extraPermissions) ? user.extraPermissions : [];
  const denied = new Set(Array.isArray(user.deniedPermissions) ? user.deniedPermissions : []);
  return [...new Set([...base, ...grants].filter((permission) => !denied.has(permission)))];
}

export function hasPermission(user, permission) {
  if (!user) return false;
  const denied = Array.isArray(user.deniedPermissions) ? user.deniedPermissions : [];
  if (denied.includes(permission)) return false;
  const roles = Array.isArray(user.roles) ? user.roles : [user.roles];
  if (roles.includes(ROLES.ADMIN)) return true;
  return permissionsFor(user).includes(permission);
}

export function primaryRole(user) {
  return Array.isArray(user.roles) ? user.roles[0] : user.roles;
}

export function safeUserDto(user) {
  if (!user) return null;
  const source = typeof user.toObject === 'function' ? user.toObject() : user;
  return {
    id: String(source._id),
    fullName: source.fullName,
    email: source.email,
    phone: source.phone ?? null,
    roles: source.roles,
    accountStatus: source.accountStatus,
    emailVerifiedAt: source.emailVerifiedAt ?? null,
    profileMediaId: source.profileMediaId ? String(source.profileMediaId) : null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
}

export function isAdmin(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [user?.roles];
  return roles.includes(ROLES.ADMIN);
}

export function isOwner(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [user?.roles];
  return roles.includes(ROLES.OWNER);
}

export function isCustomer(user) {
  const roles = Array.isArray(user?.roles) ? user.roles : [user?.roles];
  return roles.includes(ROLES.CUSTOMER);
}
