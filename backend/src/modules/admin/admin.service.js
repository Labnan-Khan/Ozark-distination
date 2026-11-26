import { z } from 'zod';
import { ACCOUNT_STATUS, ROLES } from '../../shared/constants/index.js';
import { badRequest, conflict, notFound } from '../../shared/errors/index.js';
import { safeUserDto } from '../../shared/services/index.js';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/index.js';
import { logger } from '../../infrastructure/logging/index.js';
import { Setting } from './setting.model.js';
import { User } from '../users/user.model.js';
import { DeletionRequest } from '../users/deletionRequest.model.js';
import { ADMIN_ACCOUNT_STATUSES } from './admin.validation.js';

const USER_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'fullName', 'email', 'accountStatus']);
const DELETION_SORT_FIELDS = new Set(['createdAt', 'updatedAt', 'status']);
const REPORT_GROUPS = ['day', 'city', 'category'];

/** Per-key validation for platform settings. Unknown keys are accepted as arbitrary JSON. */
const SETTING_SCHEMAS = Object.freeze({
  maxImagesPerProperty: z.number().int().positive(),
  defaultCurrency: z.string().regex(/^[A-Z]{3}$/, 'Expected a 3-letter uppercase ISO-4217 code'),
  leadTimeDays: z.number().int().min(0),
  maxAdvanceDays: z.number().int().positive(),
  loginRateMax: z.number().int().positive(),
  featureFlags: z.record(z.any())
});

const STATUS_ACTIONS = Object.freeze({
  [ACCOUNT_STATUS.ACTIVE]: 'user.activate',
  [ACCOUNT_STATUS.SUSPENDED]: 'user.suspend',
  [ACCOUNT_STATUS.DEACTIVATED]: 'user.deactivate'
});

function zodDetails(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'value',
    message: issue.message
  }));
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildSort(sort, allowedFields, fallback) {
  const result = {};
  for (const token of String(sort || '').split(',').map((part) => part.trim()).filter(Boolean)) {
    const descending = token.startsWith('-');
    const field = descending ? token.slice(1) : token;
    if (allowedFields.has(field)) result[field] = descending ? -1 : 1;
  }
  return Object.keys(result).length > 0 ? result : fallback;
}

function safeActor(actor) {
  const source = actor && typeof actor.toObject === 'function' ? actor.toObject() : actor;
  if (!source) return { actorId: null, actorRole: ROLES.ADMIN, correlationId: null };
  const actorId = source._id ?? source.id ?? source.userId ?? null;
  const roles = Array.isArray(source.roles) ? source.roles : source.role ? [source.role] : [];
  return {
    actorId: actorId ? String(actorId) : null,
    actorRole: roles[0] || ROLES.ADMIN,
    correlationId: source.correlationId ?? null
  };
}

function auditContext(actor, meta = {}) {
  const { actorId, actorRole, correlationId } = safeActor(actor);
  return {
    actorId,
    actorRole,
    metadata: {
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      requestId: meta.requestId ?? null,
      correlationId: meta.correlationId ?? correlationId ?? null
    }
  };
}

async function recordAudit(entry, actor, meta = {}) {
  // Dynamic import keeps module boot order independent of the auditLogs module.
  const { auditService } = await import('../auditLogs/index.js');
  return auditService.record({ ...auditContext(actor, meta), ...entry });
}

function settingDto(setting, warnings = []) {
  const source = typeof setting.toObject === 'function' ? setting.toObject() : setting;
  const dto = {
    id: String(source._id),
    key: source.key,
    value: source.value,
    description: source.description ?? '',
    updatedBy: source.updatedBy ? String(source.updatedBy) : null,
    createdAt: source.createdAt,
    updatedAt: source.updatedAt
  };
  if (warnings.length) dto.warnings = warnings;
  return dto;
}

function reportKey(booking, groupBy) {
  if (groupBy === 'day') {
    const createdAt = booking?.createdAt ? new Date(booking.createdAt) : null;
    return createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toISOString().slice(0, 10) : 'unknown';
  }

  const snapshot = booking?.propertySnapshot || {};
  if (groupBy === 'city') {
    return snapshot.addressSummary?.city || snapshot.address?.city || snapshot.city || 'Unknown';
  }
  return snapshot.categorySnapshot?.code
    || snapshot.categorySnapshot?.name
    || (snapshot.categoryId ? String(snapshot.categoryId) : 'Unknown');
}

export const adminService = {
  async listUsers(query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = {};

    if (query.role) filter.roles = query.role;
    if (query.accountStatus) filter.accountStatus = query.accountStatus;
    if (query.q) {
      const pattern = escapeRegex(query.q);
      filter.$or = [
        { fullName: { $regex: pattern, $options: 'i' } },
        { email: { $regex: pattern, $options: 'i' } },
        { phone: { $regex: pattern, $options: 'i' } }
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort(buildSort(query.sort, USER_SORT_FIELDS, { createdAt: -1 }))
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter)
    ]);

    return {
      items: users.map(safeUserDto),
      meta: buildPaginationMeta({ page, limit, total })
    };
  },

  async getUserById(userId) {
    const { usersService } = await import('../users/index.js');
    return safeUserDto(await usersService.getById(userId));
  },

  async createAdmin(input, actor, meta = {}) {
    const { authService } = await import('../auth/index.js');
    const user = await authService.createAdminAccount(input, actor, meta);

    await recordAudit({
      action: 'admin.create',
      entityType: 'user',
      entityId: user.id,
      after: user
    }, actor, meta);

    return user;
  },

  async updateUserStatus(userId, status, actor, reason = null, meta = {}) {
    const parsedStatus = z.enum(ADMIN_ACCOUNT_STATUSES).safeParse(status);
    if (!parsedStatus.success) throw badRequest('Invalid account status', zodDetails(parsedStatus.error));

    const normalizedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
    if (status !== ACCOUNT_STATUS.ACTIVE && !normalizedReason) {
      throw badRequest('A reason is required for this status change', [{
        field: 'reason',
        message: 'Reason is required when suspending or deactivating an account'
      }]);
    }

    const { usersService } = await import('../users/index.js');
    const beforeUser = safeUserDto(await usersService.getById(userId));
    const user = await usersService.setStatus(userId, status, actor, normalizedReason);

    await recordAudit({
      action: STATUS_ACTIONS[status],
      entityType: 'user',
      entityId: String(userId),
      before: { accountStatus: beforeUser.accountStatus },
      after: { accountStatus: user.accountStatus },
      changeSummary: [{
        field: 'accountStatus',
        before: beforeUser.accountStatus,
        after: user.accountStatus
      }],
      reason: normalizedReason
    }, actor, meta);

    return user;
  },

  async directDelete(userId, actor, reason = null, meta = {}) {
    const normalizedReason = typeof reason === 'string' && reason.trim() ? reason.trim() : null;
    if (!normalizedReason) {
      throw badRequest('A reason is required for direct deletion', [{
        field: 'reason',
        message: 'Reason is required when an admin deletes an account'
      }]);
    }

    const { usersService } = await import('../users/index.js');
    const actorId = safeActor(actor).actorId;
    const beforeUser = safeUserDto(await usersService.getById(userId));

    // Soft deletion only: request the deletion, then tombstone the account via the users service.
    const request = await usersService.requestDeletion(userId, normalizedReason, 'admin');
    const user = await usersService.completeDeletion(userId, actorId);

    request.status = 'completed';
    request.processedAt = new Date();
    request.review = { reviewedBy: actorId, reviewedAt: new Date(), note: normalizedReason };
    await request.save();

    await recordAudit({
      action: 'user.delete',
      entityType: 'user',
      entityId: String(userId),
      before: beforeUser,
      after: user,
      reason: normalizedReason
    }, actor, meta);

    return { request, user };
  },

  async listDeletionRequests(query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = query.status ? { status: query.status } : {};

    const [items, total] = await Promise.all([
      DeletionRequest.find(filter)
        .sort(buildSort(query.sort, DELETION_SORT_FIELDS, { createdAt: 1 }))
        .skip(skip)
        .limit(limit),
      DeletionRequest.countDocuments(filter)
    ]);

    return {
      items,
      meta: buildPaginationMeta({ page, limit, total })
    };
  },

  async reviewDeletionRequest(id, decision, actor, note = null, meta = {}) {
    const parsedDecision = z.enum(['approve', 'reject']).safeParse(decision);
    if (!parsedDecision.success) throw badRequest('Invalid decision', zodDetails(parsedDecision.error));

    const normalizedNote = typeof note === 'string' && note.trim() ? note.trim() : null;
    if (decision === 'reject' && !normalizedNote) {
      throw badRequest('A note is required when rejecting a deletion request', [{
        field: 'note',
        message: 'Reason/note is required for rejection'
      }]);
    }

    const request = await DeletionRequest.findById(id);
    if (!request) throw notFound('Deletion request not found');
    if (request.status !== 'pending') {
      throw conflict('INVALID_STATE_TRANSITION', 'Deletion request has already been reviewed');
    }

    const actorId = safeActor(actor).actorId;
    const previousStatus = request.status;

    if (decision === 'approve') {
      const { usersService } = await import('../users/index.js');
      await usersService.completeDeletion(request.userId, actorId);
      request.status = 'approved';
      request.processedAt = new Date();
    } else {
      request.status = 'rejected';
    }

    request.review = { reviewedBy: actorId, reviewedAt: new Date(), note: normalizedNote };
    await request.save();

    await recordAudit({
      action: decision === 'approve' ? 'deletionRequest.approve' : 'deletionRequest.reject',
      entityType: 'deletionRequest',
      entityId: String(request._id),
      before: { status: previousStatus },
      after: { status: request.status },
      changeSummary: [{ field: 'status', before: previousStatus, after: request.status }],
      reason: normalizedNote
    }, actor, meta);

    return request;
  },

  async getSettings() {
    const settings = await Setting.find().sort({ key: 1 });
    return settings.map((setting) => settingDto(setting));
  },

  async updateSetting(key, value, actor, meta = {}) {
    const schema = SETTING_SCHEMAS[key];
    let warnings = [];

    if (schema) {
      const parsed = schema.safeParse(value);
      if (!parsed.success) throw badRequest(`Invalid value for setting "${key}"`, zodDetails(parsed.error));
      value = parsed.data;
    } else {
      warnings = [{
        field: 'key',
        message: `Unknown setting key "${key}"; value accepted as arbitrary JSON`
      }];
      logger.warn({ key, details: warnings }, 'unknown setting key accepted');
    }

    const previous = await Setting.findOne({ key });
    const beforeValue = previous ? previous.value : null;
    const actorId = safeActor(actor).actorId;

    const setting = await Setting.findOneAndUpdate(
      { key },
      {
        $set: { value, updatedBy: actorId },
        $setOnInsert: { key, description: '' }
      },
      { new: true, upsert: true, runValidators: true }
    );

    await recordAudit({
      action: 'settings.update',
      entityType: 'settings',
      entityId: key,
      before: { value: beforeValue ?? null },
      after: { value: value ?? null },
      changeSummary: [{ field: 'value', before: beforeValue ?? null, after: value ?? null }]
    }, actor, meta);

    return settingDto(setting, warnings);
  },

  async getAuditLogs(filters = {}, pagination = {}) {
    // Dynamic import keeps module boot order independent of the auditLogs module.
    const { auditService } = await import('../auditLogs/index.js');
    const result = await auditService.query(filters, pagination);

    if (Array.isArray(result)) {
      const { page, limit } = parsePagination(pagination);
      return {
        items: result,
        meta: buildPaginationMeta({ page, limit, total: result.length })
      };
    }
    if (result && !result.items && Array.isArray(result.logs)) {
      return { items: result.logs, meta: result.meta };
    }
    return result;
  },

  async bookingReport(query = {}) {
    const parsedGroup = z.enum(REPORT_GROUPS).safeParse(query.groupBy || 'day');
    if (!parsedGroup.success) throw badRequest('Invalid groupBy', zodDetails(parsedGroup.error));
    const groupBy = parsedGroup.data;

    // bookings is still being implemented; dynamic import avoids boot-order coupling.
    const { bookingsService } = await import('../bookings/index.js');
    const result = await bookingsService.listAll(query);
    const items = Array.isArray(result?.items) ? result.items : [];

    const buckets = new Map();
    for (const item of items) {
      const key = reportKey(item, groupBy);
      const bucket = buckets.get(key) || { key, count: 0, totalMinor: 0, currency: null };
      bucket.count += 1;
      const amount = Number(item?.priceSnapshot?.totalMinor);
      if (Number.isFinite(amount)) bucket.totalMinor += amount;
      if (!bucket.currency && item?.priceSnapshot?.currency) bucket.currency = item.priceSnapshot.currency;
      buckets.set(key, bucket);
    }

    const rows = [...buckets.values()]
      .map((bucket) => ({ groupBy, ...bucket }))
      .sort((a, b) => String(a.key).localeCompare(String(b.key)));

    return { rows, meta: result?.meta };
  }
};
