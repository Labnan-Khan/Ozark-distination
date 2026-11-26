import { describe, expect, it } from '@jest/globals';
import { buildPaginationMeta, diffObjects, eachDateInRange, hashToken, parsePagination, toDateOnly } from '../../src/shared/utils/index.js';
import { hasPermission, permissionsFor, safeUserDto } from '../../src/shared/services/index.js';
import { PERMISSIONS, ROLES } from '../../src/shared/constants/index.js';

describe('shared utilities', () => {
  it('generates every date in a half-open range', () => {
    const dates = eachDateInRange(toDateOnly('2030-01-01'), toDateOnly('2030-01-04'));
    expect(dates.map((date) => date.toISOString().slice(0, 10))).toEqual(['2030-01-01', '2030-01-02', '2030-01-03']);
  });

  it('caps page size', () => {
    expect(parsePagination({ page: '0', limit: '500' })).toMatchObject({ page: 1, limit: 100 });
  });

  it('builds pagination metadata', () => {
    expect(buildPaginationMeta({ page: 1, limit: 20, total: 45 })).toMatchObject({ totalPages: 3, hasNext: true, hasPrev: false });
  });

  it('hashes tokens deterministically', () => {
    expect(hashToken('abc')).toBe(hashToken('abc'));
    expect(hashToken('abc')).not.toBe('abc');
  });

  it('diffs objects safely', () => {
    expect(diffObjects({ a: 1, b: 2 }, { a: 1, b: 3, c: 4 })).toEqual([
      { field: 'b', before: 2, after: 3 },
      { field: 'c', before: null, after: 4 }
    ]);
  });
});

describe('permission registry', () => {
  it('grants customer permissions only to customers', () => {
    const customer = { roles: [ROLES.CUSTOMER] };
    expect(hasPermission(customer, PERMISSIONS.BOOKING_CREATE_OWN)).toBe(true);
    expect(hasPermission(customer, PERMISSIONS.PROPERTY_APPROVE_ANY)).toBe(false);
  });

  it('honors explicit grants and denials', () => {
    const user = { roles: [ROLES.CUSTOMER], extraPermissions: [PERMISSIONS.PROPERTY_READ_OWN], deniedPermissions: [PERMISSIONS.BOOKING_CREATE_OWN] };
    expect(permissionsFor(user)).toContain(PERMISSIONS.PROPERTY_READ_OWN);
    expect(hasPermission(user, PERMISSIONS.BOOKING_CREATE_OWN)).toBe(false);
  });

  it('admins hold all permissions', () => {
    expect(hasPermission({ roles: [ROLES.ADMIN] }, PERMISSIONS.AUDIT_READ)).toBe(true);
  });

  it('never serializes password hashes in user DTOs', () => {
    const dto = safeUserDto({ _id: '1', fullName: 'A', email: 'a@b.com', roles: ['customer'], passwordHash: 'secret' });
    expect(dto.passwordHash).toBeUndefined();
  });
});
