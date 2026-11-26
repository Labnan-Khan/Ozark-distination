import mongoose from 'mongoose';
import { badRequest } from '../../shared/errors/index.js';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/index.js';
import { AuditLog, AUDIT_ENTITY_TYPES } from './auditLog.model.js';

const SENSITIVE_KEY = /password|token|secret|authorization/i;
const SORT_FIELDS = new Set(['createdAt', 'actorId', 'action', 'entityType', 'entityId']);

function sanitize(value, seen = new WeakSet()) {
  if (value === null || value === undefined) return value ?? null;
  if (value instanceof Date || value instanceof mongoose.Types.ObjectId) return value;
  if (typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);

  if (Array.isArray(value)) return value.map((item) => sanitize(item, seen));
  if (typeof value.toObject === 'function') return sanitize(value.toObject(), seen);

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    if (SENSITIVE_KEY.test(key)) continue;
    result[key] = sanitize(item, seen);
  }
  return result;
}

function normalizeActor(actor, direct = {}) {
  const source = actor && typeof actor === 'object' ? actor : { _id: actor };
  const rawId = source.userId || source._id || source.actorId || direct.actorId;
  if (!mongoose.Types.ObjectId.isValid(rawId)) throw badRequest('A valid actor is required');

  const roles = Array.isArray(source.roles) ? source.roles : [source.roles];
  const actorRole = source.role || source.actorRole || roles.find(Boolean) || direct.actorRole || 'unknown';
  return {
    actorId: rawId instanceof mongoose.Types.ObjectId ? rawId : new mongoose.Types.ObjectId(String(rawId)),
    actorRole: String(actorRole)
  };
}

function parseSort(sort) {
  const tokens = String(sort || '-createdAt').split(',').map((token) => token.trim()).filter(Boolean);
  const spec = {};
  for (const token of tokens) {
    const descending = token.startsWith('-');
    const field = descending ? token.slice(1) : token;
    if (!SORT_FIELDS.has(field)) continue;
    spec[field] = descending ? -1 : 1;
  }
  return Object.keys(spec).length ? spec : { createdAt: -1 };
}

function auditDto(document) {
  const source = typeof document?.toObject === 'function' ? document.toObject() : document;
  if (!source) return null;
  return {
    id: String(source._id),
    actorId: String(source.actorId),
    actorRole: source.actorRole,
    action: source.action,
    entityType: source.entityType,
    entityId: source.entityId instanceof mongoose.Types.ObjectId ? String(source.entityId) : source.entityId,
    before: source.before ?? null,
    after: source.after ?? null,
    changeSummary: source.changeSummary || [],
    reason: source.reason ?? null,
    metadata: source.metadata || {},
    createdAt: source.createdAt
  };
}

export const auditService = {
  async record({
    actor,
    actorId: directActorId,
    actorRole: directActorRole,
    action,
    entityType,
    entityId,
    before = null,
    after = null,
    changeSummary = [],
    reason = null,
    metadata = {}
  } = {}, session) {
    const { actorId, actorRole } = normalizeActor(actor, {
      actorId: directActorId,
      actorRole: directActorRole
    });
    if (!action) throw badRequest('action is required');
    if (!AUDIT_ENTITY_TYPES.includes(entityType)) throw badRequest('Invalid entityType');
    if (entityId === undefined || entityId === null || entityId === '') throw badRequest('entityId is required');

    const isDbSession = Boolean(session && typeof session.startSession === 'function');
    const context = session && !isDbSession ? session : {};
    const mergedMetadata = {
      ...(metadata && typeof metadata === 'object' ? metadata : {}),
      ...(context.requestId ? { requestId: context.requestId } : {}),
      ...(context.correlationId ? { correlationId: context.correlationId } : {}),
      ...(context.eventId ? { eventId: context.eventId } : {})
    };

    const [document] = await AuditLog.create([{
      actorId,
      actorRole,
      action: String(action),
      entityType,
      entityId: sanitize(entityId),
      before: sanitize(before),
      after: sanitize(after),
      changeSummary: Array.isArray(changeSummary) ? sanitize(changeSummary) : [],
      reason: reason == null ? null : String(reason),
      metadata: sanitize(mergedMetadata)
    }], isDbSession ? { session } : undefined);

    return auditDto(document);
  },

  async query(filters = {}, pagination = {}) {
    const search = { ...filters, ...pagination };
    const { page, limit, skip } = parsePagination(search);
    const filter = {};

    if (search.actorId && mongoose.Types.ObjectId.isValid(search.actorId)) {
      filter.actorId = search.actorId;
    }
    if (search.action) filter.action = String(search.action);
    if (search.entityType) filter.entityType = String(search.entityType);
    if (search.entityId) {
      const value = String(search.entityId);
      const candidates = [value];
      if (mongoose.Types.ObjectId.isValid(value)) candidates.push(new mongoose.Types.ObjectId(value));
      filter.entityId = { $in: candidates };
    }
    if (search.from || search.to) {
      filter.createdAt = {};
      if (search.from) filter.createdAt.$gte = new Date(search.from);
      if (search.to) filter.createdAt.$lte = new Date(search.to);
    }

    const [documents, total] = await Promise.all([
      AuditLog.find(filter).sort(parseSort(search.sort)).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter)
    ]);

    return {
      items: documents.map(auditDto),
      meta: buildPaginationMeta({ page, limit, total })
    };
  }
};
