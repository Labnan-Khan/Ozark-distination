import mongoose from 'mongoose';
import {
  ACCOUNT_STATUS,
  APPROVAL_STATUS,
  AVAILABILITY_STATUS,
  BOOKING_STATUS,
  EVENT_TYPES,
  LISTING_STATUS,
  PERMISSIONS,
  RENTAL_PERIODS,
  RESERVATION_SOURCES
} from '../../shared/constants/index.js';
import { appConfig } from '../../config/appConfig.js';
import { withTransaction } from '../../config/database.js';
import { eventBus } from '../../infrastructure/events/index.js';
import { badRequest, conflict, forbidden, invalidState, notFound, unauthorized } from '../../shared/errors/index.js';
import { hasPermission, isAdmin, primaryRole } from '../../shared/services/index.js';
import {
  buildPaginationMeta,
  diffObjects,
  toDateOnly
} from '../../shared/utils/index.js';
import { User } from '../users/user.model.js';
import { categoriesService } from '../categories/index.js';
import { amenitiesService } from '../amenities/index.js';
import { auditService } from '../auditLogs/index.js';
import { AuditLog } from '../auditLogs/auditLog.model.js';
import { mediaService } from '../media/index.js';
import { Booking } from '../bookings/booking.model.js';
import { AvailabilityReservation } from '../bookings/reservation.model.js';
import { ApprovalHistory } from './approvalHistory.model.js';
import { ChangeRequest } from './changeRequest.model.js';
import { DuplicateFlag } from './duplicateFlag.model.js';
import { Property } from './property.model.js';
import { PropertyLifecycleRequest } from './propertyLifecycleRequest.model.js';
import { propertyRepository } from './property.repository.js';
import { duplicateDetection } from './duplicateDetection/index.js';
import {
  availabilityQuerySchema,
  blockDatesSchema,
  createPropertySchema,
  lifecycleApproveSchema,
  lifecycleRejectSchema,
  lifecycleRequestCreateSchema,
  lifecycleRequestListQuerySchema,
  reviewDecisionSchema,
  duplicateDecisionSchema,
  softDeleteSchema,
  updatePropertySchema
} from './property.validation.js';

const EDITABLE_FIELDS = [
  'title',
  'description',
  'address',
  'location',
  'attributes',
  'amenities',
  'pricing',
  'rentalPeriods',
  'bookingConfig',
  'availability',
  'mediaOrder'
];
const EDITABLE_FIELD_SET = new Set(EDITABLE_FIELDS);
const DAY_MS = 24 * 60 * 60 * 1000;

function toPlain(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value.toObject === 'function') return value.toObject();
  if (Array.isArray(value)) return value.map(toPlain);
  return value;
}

function clone(value) {
  const plain = toPlain(value);
  if (plain === null || plain === undefined) return plain;
  return JSON.parse(JSON.stringify(plain));
}

function asArray(value, keys = []) {
  if (Array.isArray(value)) return value;
  for (const key of keys) {
    if (Array.isArray(value?.[key])) return value[key];
  }
  return [];
}

function parseOrThrow(schema, input) {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw badRequest('Validation failed', parsed.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message
    })));
  }
  return parsed.data;
}

function actorId(actor) {
  return actor?._id || actor?.userId || actor?.id || null;
}

function actorRole(actor) {
  return primaryRole(actor) || actor?.role || actor?.actorRole || 'system';
}

function actorMeta(actor) {
  return {
    userId: String(actorId(actor) || 'system'),
    role: actorRole(actor)
  };
}

function isAdminActor(actor) {
  return Boolean(actor && isAdmin(actor));
}

function assertAuthenticated(actor) {
  if (!actor || !actorId(actor)) throw unauthorized();
}

function assertCanManage(property, actor, permission) {
  assertAuthenticated(actor);
  if (isAdminActor(actor) || hasPermission(actor, permission)) {
    const canManageAny = isAdminActor(actor) || hasPermission(actor, PERMISSIONS.PROPERTY_UPDATE_ANY)
      || hasPermission(actor, PERMISSIONS.PROPERTY_READ_ANY)
      || permission === PERMISSIONS.PROPERTY_UPDATE_ANY;
    if (!canManageAny && property && String(property.ownerId) !== String(actorId(actor))) {
      throw forbidden('You cannot modify this property');
    }
    return;
  }
  throw forbidden('You cannot modify this property');
}

function assertAdminActor(actor) {
  assertAuthenticated(actor);
  if (!isAdminActor(actor) && !hasPermission(actor, PERMISSIONS.PROPERTY_APPROVE_ANY)) {
    throw forbidden('Administrator access required');
  }
}

async function publishEvent(type, payload, actor, correlationId, session = null) {
  return eventBus.publish({
    type,
    actor: actorMeta(actor),
    payload,
    correlationId: correlationId || actor?.correlationId || null
  }, session);
}

async function recordAudit(action, entityId, before, after, actor, reason, metadata, session = null) {
  if (!isAdminActor(actor)) return null;
  return auditService.record({
    actor: actorMeta(actor),
    action,
    entityType: 'property',
    entityId: String(entityId),
    before: before || null,
    after: after || null,
    reason: reason || null,
    metadata: metadata || {}
  }, session || undefined);
}

async function recordLifecycleAudit(action, propertyId, request, actor, reason, before, after, session = null) {
  const requestId = request ? String(request._id) : null;
  return auditService.record({
    actor: actorMeta(actor),
    action,
    entityType: 'property',
    entityId: String(propertyId),
    before: before || null,
    after: after || null,
    reason: reason || null,
    metadata: {
      ...(requestId ? { requestId, lifecycleRequestId: requestId } : {}),
      ...(request?.action ? { lifecycleAction: request.action } : {})
    }
  }, session || undefined);
}

function assertCanDeleteAny(actor) {
  assertAuthenticated(actor);
  if (!isAdminActor(actor) && !hasPermission(actor, PERMISSIONS.PROPERTY_DELETE_ANY)) {
    throw forbidden('Administrator access required');
  }
}

function assertCanRequestLifecycle(property, actor) {
  assertAuthenticated(actor);
  if (!isAdminActor(actor) && !hasPermission(actor, PERMISSIONS.PROPERTY_LIFECYCLE_REQUEST_OWN)) {
    throw forbidden('You cannot request a property lifecycle change');
  }
  assertCanManage(property, actor, PERMISSIONS.PROPERTY_LIFECYCLE_REQUEST_OWN);
}

async function hasPropertyHistory(propertyId, session = null) {
  const id = String(propertyId);
  const auditIds = [id];
  if (mongoose.Types.ObjectId.isValid(id)) auditIds.push(new mongoose.Types.ObjectId(id));

  const bookingQuery = Booking.countDocuments({ propertyId });
  const auditQuery = AuditLog.countDocuments({
    entityType: 'property',
    entityId: { $in: auditIds }
  });
  const [bookings, audits] = await Promise.all([
    session ? bookingQuery.session(session) : bookingQuery,
    session ? auditQuery.session(session) : auditQuery
  ]);
  return bookings > 0 || audits > 0;
}

async function createLifecycleRequest({ property, actor, action, reason = null, note = null, session }) {
  const [request] = await PropertyLifecycleRequest.create([{
    propertyId: property._id,
    ownerId: property.ownerId,
    action,
    reason: reason || null,
    status: 'pending',
    currentSnapshot: safeSnapshot(property),
    note: note || null,
    requestedBy: actorId(actor)
  }], { session });

  await publishEvent(EVENT_TYPES.PROPERTY_LIFECYCLE_REQUESTED, {
    propertyId: String(property._id),
    ownerId: String(property.ownerId),
    title: property.title,
    requestId: String(request._id),
    action,
    reason: reason || null,
    requestedBy: String(actorId(actor) || 'system'),
    requestedAt: new Date().toISOString()
  }, actor, actor?.correlationId, session);
  await recordLifecycleAudit(
    EVENT_TYPES.PROPERTY_LIFECYCLE_REQUESTED,
    property._id,
    request,
    actor,
    reason,
    null,
    clone(request),
    session
  );
  return request;
}

async function applyArchive(property, actor, reason, session) {
  const before = safeSnapshot(property);
  property.listingStatus = LISTING_STATUS.ARCHIVED;
  property.archivedAt = new Date();
  property.archivedBy = actorId(actor);
  property.deleteReason = reason || property.deleteReason || null;
  await property.save({ session });

  await publishEvent(EVENT_TYPES.PROPERTY_ARCHIVED, {
    propertyId: String(property._id),
    reason: reason || null,
    archivedBy: String(actorId(actor) || 'system')
  }, actor, actor?.correlationId, session);
  await recordAudit(EVENT_TYPES.PROPERTY_ARCHIVED, property._id, before, safeSnapshot(property), actor, reason, {}, session);
  return property;
}

async function applySoftDelete(property, actor, reason, session, { skipHistoryCheck = false } = {}) {
  if (!skipHistoryCheck && await hasPropertyHistory(property._id, session)) {
    throw conflict('PROPERTY_HAS_HISTORY', 'Property has booking or audit history and cannot be deleted');
  }

  const before = safeSnapshot(property);
  const now = new Date();
  property.deletedAt = now;
  property.deletedBy = actorId(actor);
  property.deleteReason = reason || null;
  property.listingStatus = LISTING_STATUS.ARCHIVED;
  property.archivedAt = property.archivedAt || now;
  property.archivedBy = property.archivedBy || actorId(actor);
  await property.save({ session });

  await publishEvent(EVENT_TYPES.PROPERTY_DELETED, {
    propertyId: String(property._id),
    ownerId: String(property.ownerId),
    title: property.title,
    reason: reason || null,
    deletedAt: now.toISOString(),
    deletedBy: String(actorId(actor) || 'system')
  }, actor, actor?.correlationId, session);
  await recordAudit(EVENT_TYPES.PROPERTY_DELETED, property._id, before, safeSnapshot(property), actor, reason, {}, session);
  return property;
}

async function getCategory(categoryId) {
  try {
    const category = await categoriesService.getById(categoryId);
    return category ? toPlain(category) : null;
  } catch {
    return null;
  }
}

function normalizeAddress(address = {}, existing = {}) {
  const merged = {
    country: existing.country ?? null,
    stateProvince: existing.stateProvince ?? null,
    city: existing.city ?? null,
    area: existing.area ?? null,
    street: existing.street ?? null,
    unitNumber: existing.unitNumber ?? null,
    fullAddress: existing.fullAddress ?? null,
    postalCode: existing.postalCode ?? null,
    ...toPlain(address)
  };
  if (!merged.country || !merged.city || !merged.street) {
    throw badRequest('address.country, address.city and address.street are required');
  }
  merged.fullAddress = merged.fullAddress || [
    merged.unitNumber,
    merged.street,
    merged.area,
    merged.city,
    merged.stateProvince,
    merged.postalCode,
    merged.country
  ].filter(Boolean).join(', ');
  return merged;
}

function coerceAttributes(category, attributes = []) {
  const definitions = new Map(
    asArray(category?.attributeSchema).map((definition) => [String(definition.key), definition])
  );
  return attributes.map((item) => {
    const source = toPlain(item) || {};
    const key = String(source.key || '');
    const definition = definitions.get(key) || {};
    const rawValue = source.value !== undefined ? source.value : null;
    const hasTypedSlot = ['stringValue', 'numberValue', 'booleanValue', 'dateValue', 'arrayValue']
      .some((slot) => source[slot] !== undefined && source[slot] !== null);
    const dataType = source.dataType || definition.dataType || (
      Array.isArray(rawValue) ? 'multiEnum'
        : typeof rawValue === 'number' ? 'number'
          : typeof rawValue === 'boolean' ? 'boolean' : 'string'
    );

    const value = {
      key,
      dataType,
      stringValue: source.stringValue ?? null,
      numberValue: source.numberValue ?? null,
      booleanValue: source.booleanValue ?? null,
      dateValue: source.dateValue ?? null,
      arrayValue: source.arrayValue ?? [],
      unit: source.unit ?? definition.unit ?? null,
      categoryId: source.categoryId ?? category?._id ?? category?.id ?? null,
      schemaVersion: source.schemaVersion ?? category?.attributeSchemaVersion ?? 1
    };

    if (!hasTypedSlot && rawValue !== null) {
      if (['number', 'integer'].includes(dataType)) value.numberValue = Number(rawValue);
      else if (dataType === 'boolean') value.booleanValue = Boolean(rawValue);
      else if (dataType === 'multiEnum') value.arrayValue = asArray(rawValue).map(String);
      else if (dataType === 'date') value.stringValue = String(rawValue);
      else value.stringValue = String(rawValue);
    }
    return value;
  });
}

async function normalizeAttributes(categoryId, attributes = []) {
  const category = await getCategory(categoryId);
  if (!category) throw badRequest('Category not found');
  let validated;
  try {
    validated = await categoriesService.validateAttributes(categoryId, attributes);
  } catch (error) {
    if (error?.isOperational || error?.statusCode) throw error;
    throw badRequest('Invalid attributes', [{ message: String(error?.message || error) }]);
  }
  return coerceAttributes(category, asArray(validated, ['attributes', 'values', 'items', 'data']));
}

async function normalizeAmenities(ids = []) {
  const list = Array.isArray(ids) ? ids : asArray(ids, ['ids', 'amenities', 'items']);
  const uniqueIds = [...new Set(list.map(String))];
  if (!uniqueIds.length) return { ids: [], snapshot: [] };

  let validation;
  try {
    validation = await amenitiesService.validateIds(uniqueIds);
  } catch (error) {
    if (error?.isOperational || error?.statusCode) throw error;
    throw badRequest('Invalid amenities', [{ message: String(error?.message || error) }]);
  }
  void validation;

  const snapshots = asArray(await amenitiesService.getSnapshot(uniqueIds), ['amenities', 'items']);
  const snapshot = snapshots.map((item) => {
    const plain = toPlain(item) || {};
    return {
      id: plain.id || plain._id || null,
      code: plain.code || null,
      name: plain.name || null
    };
  });
  return { ids: uniqueIds, snapshot };
}

async function normalizeRentalPeriods(periods, category) {
  const allowed = asArray(category?.allowedRentalPeriods, ['periods']).length
    ? asArray(category.allowedRentalPeriods, ['periods']).map(String)
    : [RENTAL_PERIODS.MONTHLY];
  const uniquePeriods = [...new Set(asArray(periods).map(String))];
  if (!uniquePeriods.length) throw badRequest('At least one rental period is required');
  const invalid = uniquePeriods.filter((period) => !allowed.includes(period));
  if (invalid.length) throw badRequest(`Rental periods not allowed for this category: ${invalid.join(', ')}`);
  return uniquePeriods;
}

function pricingFingerprint(pricing) {
  return JSON.stringify({
    currency: pricing?.currency,
    defaultPeriod: pricing?.defaultPeriod,
    rates: pricing?.rates || [],
    requiresDeposit: pricing?.requiresDeposit || false,
    depositMinor: pricing?.depositMinor ?? null,
    additionalCharges: pricing?.additionalCharges || [],
    taxConfig: pricing?.taxConfig ?? null
  });
}

function normalizePricing(inputPricing, existingPricing, rentalPeriods) {
  const existing = toPlain(existingPricing) || {};
  const periods = asArray(rentalPeriods).map(String);
  const rates = asArray(inputPricing?.rates, ['rates']).map((rate) => ({
    period: String(rate.period),
    amountMinor: Number(rate.amountMinor),
    label: rate.label ?? null
  }));
  if (!rates.length) throw badRequest('At least one pricing rate is required');
  if (rates.some((rate) => !Number.isInteger(rate.amountMinor) || rate.amountMinor <= 0)) {
    throw badRequest('Rate amounts must be positive integers in minor units');
  }
  if (new Set(rates.map((rate) => rate.period)).size !== rates.length) {
    throw badRequest('Duplicate rate periods are not allowed');
  }
  const defaultPeriod = inputPricing?.defaultPeriod || existing.defaultPeriod;
  if (!periods.includes(defaultPeriod)) throw badRequest('defaultPeriod must be one of rentalPeriods');
  const ratePeriods = new Set(rates.map((rate) => rate.period));
  const missing = periods.filter((period) => !ratePeriods.has(period));
  if (missing.length) throw badRequest(`A rate is required for: ${missing.join(', ')}`);

  const candidate = {
    currency: String(inputPricing?.currency || existing.currency || appConfig.defaults.currency).toUpperCase(),
    defaultPeriod,
    rates,
    requiresDeposit: inputPricing?.requiresDeposit ?? existing.requiresDeposit ?? false,
    depositMinor: null,
    additionalCharges: inputPricing?.additionalCharges ?? existing.additionalCharges ?? [],
    taxConfig: inputPricing?.taxConfig ?? existing.taxConfig ?? null,
    version: Number(existing.version) || 1,
    updatedAt: new Date()
  };
  candidate.depositMinor = candidate.requiresDeposit
    ? (inputPricing?.depositMinor ?? existing.depositMinor ?? null)
    : null;
  if (existing.currency && pricingFingerprint(candidate) !== pricingFingerprint(existing)) {
    candidate.version += 1;
  }
  if (!/^[A-Z]{3}$/.test(candidate.currency)) throw badRequest('Invalid currency');
  return candidate;
}

function normalizeBookingConfig(input = {}, existing = {}) {
  const merged = {
    mode: existing.mode || 'request',
    minUnits: Number(existing.minUnits) || 1,
    maxUnits: Number(existing.maxUnits) || 1,
    requireGuestCount: existing.requireGuestCount ?? false,
    maxGuests: existing.maxGuests ?? null,
    sameDayCheckInAllowed: existing.sameDayCheckInAllowed ?? false,
    cancellationPolicyId: existing.cancellationPolicyId ?? null,
    autoExpireMinutes: existing.autoExpireMinutes ?? null,
    bookingWindowDays: Number(existing.bookingWindowDays) || appConfig.defaults.maxAdvanceDays,
    ...toPlain(input)
  };
  if (merged.minUnits > merged.maxUnits) throw badRequest('maxUnits must be greater than or equal to minUnits');
  return merged;
}

function normalizeAvailability(input = {}, existing = {}) {
  return {
    isOpenForBooking: input.isOpenForBooking ?? existing.isOpenForBooking ?? true,
    leadTimeDays: input.leadTimeDays ?? existing.leadTimeDays ?? appConfig.defaults.leadTimeDays,
    maxAdvanceDays: input.maxAdvanceDays ?? existing.maxAdvanceDays ?? appConfig.defaults.maxAdvanceDays,
    status: existing.status || AVAILABILITY_STATUS.AVAILABLE,
    statusCalculatedAt: existing.statusCalculatedAt ?? null,
    note: input.note !== undefined ? input.note : (existing.note ?? null)
  };
}

function buildSearchKeywords(property) {
  const source = clone(property) || {};
  const values = [
    source.title,
    source.description,
    ...Object.values(source.address || {}),
    source.categorySnapshot?.code,
    source.categorySnapshot?.name,
    ...asArray(source.attributes).map((attribute) => {
      if (attribute.numberValue !== null && attribute.numberValue !== undefined) return attribute.numberValue;
      if (attribute.booleanValue !== null && attribute.booleanValue !== undefined) return attribute.booleanValue;
      if (attribute.stringValue) return attribute.stringValue;
      return asArray(attribute.arrayValue).join(' ');
    }),
    ...asArray(source.amenitySnapshot).map((amenity) => amenity?.name)
  ];
  const keywords = values
    .flatMap((value) => String(value ?? '').toLowerCase().match(/[a-z0-9]+/g) || []);
  return [...new Set(keywords)].slice(0, 250);
}

function safeSnapshot(property) {
  const source = clone(property) || {};
  return {
    id: source._id ? String(source._id) : null,
    title: source.title || null,
    description: source.description || null,
    ownerId: source.ownerId ? String(source.ownerId) : null,
    categoryId: source.categoryId ? String(source.categoryId) : null,
    address: source.address || null,
    location: source.location || null,
    attributes: asArray(source.attributes),
    amenities: asArray(source.amenities).map(String),
    amenitySnapshot: asArray(source.amenitySnapshot),
    pricing: source.pricing || null,
    rentalPeriods: asArray(source.rentalPeriods),
    bookingConfig: source.bookingConfig || null,
    availability: source.availability || null,
    media: source.media || null,
    listingStatus: source.listingStatus || null,
    approvalStatus: source.approvalStatus || null,
    changeRequestVersion: Number(source.changeRequestVersion) || 0
  };
}

function editableSnapshot(snapshot = {}) {
  return Object.fromEntries(EDITABLE_FIELDS
    .filter((field) => field !== 'mediaOrder' && snapshot[field] !== undefined)
    .map((field) => [field, snapshot[field]]));
}

function assignChanges(target, changes = {}) {
  for (const [field, value] of Object.entries(changes)) {
    if (!EDITABLE_FIELD_SET.has(field)) continue;
    if (field === 'address') {
      target.address = { ...(toPlain(target.address) || {}), ...toPlain(value) };
    } else if (field === 'amenities') {
      const ids = Array.isArray(value) ? value : asArray(value, ['ids']);
      target.amenities = ids.map(String);
      if (!Array.isArray(value) && value.snapshot) target.amenitySnapshot = value.snapshot;
    } else if (field === 'bookingConfig') {
      target.bookingConfig = { ...(toPlain(target.bookingConfig) || {}), ...toPlain(value) };
    } else if (field === 'availability') {
      target.availability = { ...(toPlain(target.availability) || {}), ...toPlain(value) };
    } else if (field !== 'mediaOrder') {
      target[field] = toPlain(value);
    }
  }
  return target;
}

async function prepareChanges(property, input = {}) {
  const category = await getCategory(property.categoryId);
  const changes = {};

  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = input.description;
  if (input.address !== undefined) {
    changes.address = normalizeAddress(input.address, toPlain(property.address) || {});
  }
  if (input.location !== undefined) changes.location = input.location || null;
  if (input.attributes !== undefined) {
    changes.attributes = await normalizeAttributes(property.categoryId, input.attributes);
  }
  if (input.amenities !== undefined) {
    changes.amenities = await normalizeAmenities(input.amenities);
  }
  if (input.rentalPeriods !== undefined) {
    changes.rentalPeriods = await normalizeRentalPeriods(input.rentalPeriods, category);
  }
  if (input.pricing !== undefined || input.rentalPeriods !== undefined) {
    const targetPeriods = changes.rentalPeriods || asArray(property.rentalPeriods).map(String);
    changes.pricing = normalizePricing(
      input.pricing || toPlain(property.pricing),
      toPlain(property.pricing),
      targetPeriods
    );
  }
  if (input.bookingConfig !== undefined) {
    changes.bookingConfig = normalizeBookingConfig(input.bookingConfig, toPlain(property.bookingConfig) || {});
  }
  if (input.availability !== undefined) {
    changes.availability = normalizeAvailability(input.availability, toPlain(property.availability) || {});
  }
  if (input.mediaOrder !== undefined) changes.mediaOrder = input.mediaOrder;

  return changes;
}

function publicChanges(changes = {}) {
  return {
    ...changes,
    ...(changes.amenities ? { amenities: changes.amenities.ids } : {})
  };
}

async function applyMediaOrder(propertyId, mediaOrder) {
  if (!mediaOrder?.length) return null;
  const results = [];
  for (const item of mediaOrder) {
    results.push(await mediaService.reorder('property', propertyId, item.mediaId, item.displayOrder));
  }
  return results.length === 1 ? results[0] : results;
}

function mediaIdFrom(result) {
  if (!result) return null;
  if (typeof result === 'string') return result;
  if (Array.isArray(result)) return mediaIdFrom(result[0]);
  return result.id || result._id || result.mediaId || null;
}

function addDays(date, days) {
  return new Date(date.getTime() + Number(days) * DAY_MS);
}

async function isPubliclyVisible(property) {
  if (!property || property.deletedAt
    || property.listingStatus !== LISTING_STATUS.PUBLISHED
    || property.approvalStatus !== APPROVAL_STATUS.APPROVED) return false;
  const owner = await User.findById(property.ownerId).select('accountStatus deletedAt');
  return Boolean(owner && owner.accountStatus === ACCOUNT_STATUS.ACTIVE && !owner.deletedAt);
}

async function canRead(property, actor) {
  if (!actor || !actorId(actor)) return false;
  if (isAdminActor(actor) || hasPermission(actor, PERMISSIONS.PROPERTY_READ_ANY)) return true;
  if (!hasPermission(actor, PERMISSIONS.PROPERTY_READ_OWN)) return false;
  return String(property.ownerId) === String(actorId(actor));
}

export const propertiesService = {
  listPublicForSearch() {
    // Intentionally a no-op: the search module queries the Property model directly
    // with its own filters and projections. Kept as a stable integration hook.
    return {
      properties: [],
      meta: buildPaginationMeta({ page: 1, limit: 20, total: 0 })
    };
  },

  async create(input, actor, correlationId = null) {
    assertAuthenticated(actor);
    const data = parseOrThrow(createPropertySchema, input);
    const admin = isAdminActor(actor);
    const requestedOwnerId = data.ownerId ? String(data.ownerId) : null;
    const ownerId = requestedOwnerId || String(actorId(actor));

    if (requestedOwnerId && !admin
      && String(requestedOwnerId) !== String(actorId(actor))
      && !hasPermission(actor, PERMISSIONS.PROPERTY_CREATE_ANY)) {
      throw forbidden('Only administrators may create properties for another owner');
    }
    if (admin && !requestedOwnerId) throw badRequest('ownerId is required for admin-created properties');
    if (!admin && !hasPermission(actor, PERMISSIONS.PROPERTY_CREATE_OWN)) {
      throw forbidden('Only owners can create properties');
    }

    const owner = await User.findById(ownerId).select('fullName roles accountStatus deletedAt');
    if (!owner || owner.deletedAt) throw notFound('Owner not found');
    if (!admin && !hasPermission(owner, PERMISSIONS.PROPERTY_CREATE_OWN)) {
      throw forbidden('The selected user is not an owner');
    }

    const category = await getCategory(data.categoryId);
    if (!category || category.deletedAt || category.isActive === false) {
      throw badRequest('Category is not active');
    }
    let subcategory = null;
    if (data.subcategoryId) {
      subcategory = await getCategory(data.subcategoryId);
      if (!subcategory || subcategory.deletedAt || subcategory.isActive === false) {
        throw badRequest('Subcategory is not active');
      }
    }

    const rentalPeriods = await normalizeRentalPeriods(data.rentalPeriods, category);
    const attributes = await normalizeAttributes(category._id || category.id || data.categoryId, data.attributes);
    const amenities = await normalizeAmenities(data.amenities);
    const pricing = normalizePricing(data.pricing, null, rentalPeriods);
    const bookingConfig = normalizeBookingConfig(data.bookingConfig, {});
    const availability = normalizeAvailability(data.availability || {}, {});

    const document = {
      title: data.title,
      description: data.description,
      ownerId,
      ownerSnapshot: { id: ownerId, fullName: owner.fullName },
      categoryId: data.categoryId,
      subcategoryId: data.subcategoryId || null,
      categorySnapshot: {
        code: category.code,
        name: category.name,
        group: category.group,
        attributeSchemaVersion: category.attributeSchemaVersion || 1
      },
      address: normalizeAddress(data.address, {}),
      location: data.location || null,
      attributes,
      amenities: amenities.ids,
      amenitySnapshot: amenities.snapshot,
      pricing,
      rentalPeriods,
      bookingConfig,
      availability,
      media: {
        coverMediaId: null,
        imageCount: 0,
        maxImages: appConfig.defaults.maxImagesPerProperty
      },
      listingStatus: LISTING_STATUS.DRAFT,
      approvalStatus: APPROVAL_STATUS.PENDING,
      changeRequestVersion: 0,
      schemaVersion: 1
    };

    return withTransaction(async (session) => {
      const [property] = await Property.create([{
        ...document,
        searchKeywords: buildSearchKeywords({ ...document, ownerId })
      }], { session });

      // Duplicate flags are advisory and must never prevent a listing from being created.
      await duplicateDetection.run(property, session);
      return property;
    });
  },

  async getById(id, actor = null) {
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    const visible = await isPubliclyVisible(property);
    if (!visible && !(await canRead(property, actor))) throw notFound('Property not found');
    return property;
  },

  async getPublicById(id) {
    const property = await propertyRepository.findVisibleById(id);
    if (!property || !(await isPubliclyVisible(property))) throw notFound('Property not found');
    return property;
  },

  async getBookableSnapshot(id) {
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    if (property.approvalStatus !== APPROVAL_STATUS.APPROVED) {
      throw conflict('PROPERTY_NOT_APPROVED', 'Property is not approved for bookings');
    }
    const pricing = toPlain(property.pricing) || {};
    const rates = asArray(pricing.rates, ['rates']);
    const rentalPeriods = asArray(property.rentalPeriods).map(String);
    const bookable = property.listingStatus === LISTING_STATUS.PUBLISHED
      && property.availability?.isOpenForBooking !== false
      && Boolean(pricing.currency)
      && rates.length > 0
      && rentalPeriods.length > 0
      && rentalPeriods.includes(pricing.defaultPeriod)
      && rates.every((rate) => Number(rate.amountMinor) > 0 && rentalPeriods.includes(rate.period));

    if (!bookable) throw conflict('PROPERTY_NOT_BOOKABLE', 'Property is not currently bookable');

    return {
      property,
      _id: property._id,
      title: property.title,
      description: property.description,
      ownerId: String(property.ownerId),
      ownerSnapshot: property.ownerSnapshot ? clone(property.ownerSnapshot) : null,
      categoryId: property.categoryId,
      categorySnapshot: property.categorySnapshot ? clone(property.categorySnapshot) : null,
      address: property.address ? clone(property.address) : null,
      location: property.location ? clone(property.location) : null,
      media: property.media ? clone(property.media) : null,
      currency: pricing.currency,
      rates,
      pricing: { ...pricing, rates },
      rentalPeriods,
      bookingConfig: clone(property.bookingConfig) || {},
      availability: clone(property.availability) || {}
    };
  },

  async isOwner(propertyId, userId) {
    if (!userId || !propertyId) return false;
    const property = await Property.findById(propertyId).select('ownerId');
    return Boolean(property && String(property.ownerId) === String(userId));
  },

  async hasActiveConfirmedBooking(propertyId, session = null) {
    const query = Booking.countDocuments({
      propertyId,
      status: BOOKING_STATUS.CONFIRMED,
      checkOutDate: { $gt: new Date() }
    });
    const active = await (session ? query.session(session) : query);
    return active > 0;
  },

  async recomputeAvailability(propertyId, session = null) {
    const property = await propertyRepository.findById(propertyId, session);
    if (!property || property.deletedAt) return null;

    const today = toDateOnly(new Date());
    const tomorrow = addDays(today, 1);
    const query = AvailabilityReservation.find({ propertyId, date: { $gte: today, $lt: tomorrow } });
    const reservations = await (session ? query.session(session) : query).lean();

    const hasBooking = reservations.some((reservation) => reservation.source === RESERVATION_SOURCES.BOOKING);
    const hasBlock = reservations.some((reservation) => reservation.source !== RESERVATION_SOURCES.BOOKING);
    let status;
    if (property.availability?.isOpenForBooking === false) status = AVAILABILITY_STATUS.UNAVAILABLE;
    else if (hasBooking) status = AVAILABILITY_STATUS.BOOKED;
    else if (hasBlock) status = AVAILABILITY_STATUS.UNAVAILABLE;
    else status = AVAILABILITY_STATUS.AVAILABLE;

    property.availability = {
      ...(clone(property.availability) || {}),
      status,
      statusCalculatedAt: new Date()
    };
    await property.save(session ? { session } : undefined);
    return property;
  },

  async listOwner(ownerId, query = {}) {
    const result = await propertyRepository.listOwner(ownerId, query);
    return { properties: result.items, meta: result.meta };
  },

  async submit(id, actor, note = null) {
    assertAuthenticated(actor);
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property || property.deletedAt) throw notFound('Property not found');
      assertCanManage(property, actor, PERMISSIONS.PROPERTY_SUBMIT);
      if (property.listingStatus === LISTING_STATUS.ARCHIVED) {
        throw invalidState('Archived properties must be restored before resubmission');
      }
      if (property.approvalStatus === APPROVAL_STATUS.PENDING) {
        throw conflict('ALREADY_PENDING', 'Property is already pending approval');
      }
      if (property.approvalStatus === APPROVAL_STATUS.APPROVED) {
        throw invalidState('Property is already approved');
      }

      const before = safeSnapshot(property);
      const fromStatus = property.approvalStatus;
      const now = new Date();
      property.approvalStatus = APPROVAL_STATUS.PENDING;
      property.submittedAt = now;
      property.rejectedAt = null;
      property.rejectedBy = null;
      property.approvalReason = null;
      await property.save({ session });

      await ApprovalHistory.create([{
        propertyId: property._id,
        action: fromStatus === APPROVAL_STATUS.REJECTED ? 'resubmit' : 'submit',
        fromStatus,
        toStatus: APPROVAL_STATUS.PENDING,
        actorId: actorId(actor),
        actorRole: actorRole(actor),
        reason: note || null,
        snapshot: safeSnapshot(property)
      }], { session });

      await publishEvent(EVENT_TYPES.PROPERTY_SUBMITTED, {
        propertyId: String(property._id),
        title: property.title,
        ownerId: String(property.ownerId),
        submittedAt: now.toISOString(),
        note: note || null
      }, actor, actor?.correlationId, session);
      await recordAudit(EVENT_TYPES.PROPERTY_SUBMITTED, property._id, before, safeSnapshot(property), actor, note, {}, session);
      return property;
    });
  },

  async publish(id, actor) {
    assertAuthenticated(actor);
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property || property.deletedAt) throw notFound('Property not found');
      assertCanManage(property, actor, PERMISSIONS.PROPERTY_PUBLISH);
      if (property.approvalStatus !== APPROVAL_STATUS.APPROVED) {
        throw conflict('NOT_APPROVED', 'Only approved properties can be published');
      }
      if (property.listingStatus === LISTING_STATUS.ARCHIVED) {
        throw invalidState('Archived properties require admin unarchive');
      }
      const before = safeSnapshot(property);
      property.listingStatus = LISTING_STATUS.PUBLISHED;
      await property.save({ session });
      await publishEvent(EVENT_TYPES.PROPERTY_UPDATED, {
        propertyId: String(property._id),
        listingStatus: LISTING_STATUS.PUBLISHED,
        action: 'publish'
      }, actor, actor?.correlationId, session);
      await recordAudit('PROPERTY_PUBLISHED', property._id, before, safeSnapshot(property), actor, null, {}, session);
      return property;
    });
  },

  async approve(id, actor, note = null) {
    assertAdminActor(actor);
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property || property.deletedAt) throw notFound('Property not found');
      if (property.approvalStatus === APPROVAL_STATUS.APPROVED) {
        throw conflict('ALREADY_APPROVED', 'Property is already approved');
      }
      if (property.approvalStatus !== APPROVAL_STATUS.PENDING) {
        throw invalidState('Only pending properties can be approved');
      }

      const before = safeSnapshot(property);
      const fromStatus = property.approvalStatus;
      const now = new Date();
      property.approvalStatus = APPROVAL_STATUS.APPROVED;
      property.approvedAt = now;
      property.approvedBy = actorId(actor);
      property.rejectedAt = null;
      property.rejectedBy = null;
      property.approvalReason = null;
      await property.save({ session });

      await ApprovalHistory.create([{
        propertyId: property._id,
        action: 'approve',
        fromStatus,
        toStatus: APPROVAL_STATUS.APPROVED,
        actorId: actorId(actor),
        actorRole: actorRole(actor),
        reason: note || null,
        snapshot: safeSnapshot(property)
      }], { session });

      await publishEvent(EVENT_TYPES.PROPERTY_APPROVED, {
        propertyId: String(property._id),
        ownerId: String(property.ownerId),
        title: property.title,
        approvedAt: now.toISOString(),
        note: note || null
      }, actor, actor?.correlationId, session);
      await recordAudit(EVENT_TYPES.PROPERTY_APPROVED, property._id, before, safeSnapshot(property), actor, note, {}, session);
      return property;
    });
  },

  async reject(id, actor, reason) {
    assertAdminActor(actor);
    if (!reason || !String(reason).trim()) throw badRequest('A rejection reason is required');
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property || property.deletedAt) throw notFound('Property not found');
      if (property.approvalStatus === APPROVAL_STATUS.REJECTED) {
        throw conflict('ALREADY_REJECTED', 'Property is already rejected');
      }
      if (property.approvalStatus !== APPROVAL_STATUS.PENDING) {
        throw invalidState('Only pending properties can be rejected');
      }

      const before = safeSnapshot(property);
      const fromStatus = property.approvalStatus;
      const now = new Date();
      property.approvalStatus = APPROVAL_STATUS.REJECTED;
      property.rejectedAt = now;
      property.rejectedBy = actorId(actor);
      property.approvalReason = String(reason).trim();
      await property.save({ session });

      await ApprovalHistory.create([{
        propertyId: property._id,
        action: 'reject',
        fromStatus,
        toStatus: APPROVAL_STATUS.REJECTED,
        actorId: actorId(actor),
        actorRole: actorRole(actor),
        reason: property.approvalReason,
        snapshot: safeSnapshot(property)
      }], { session });

      await publishEvent(EVENT_TYPES.PROPERTY_REJECTED, {
        propertyId: String(property._id),
        ownerId: String(property.ownerId),
        title: property.title,
        reason: property.approvalReason
      }, actor, actor?.correlationId, session);
      await recordAudit(EVENT_TYPES.PROPERTY_REJECTED, property._id, before, safeSnapshot(property), actor, property.approvalReason, {}, session);
      return property;
    });
  },

  async archive(id, actor, reason = null) {
    assertAuthenticated(actor);
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property || property.deletedAt) throw notFound('Property not found');
      assertCanManage(property, actor, PERMISSIONS.PROPERTY_ARCHIVE_OWN);

      if (!isAdminActor(actor) && await propertiesService.hasActiveConfirmedBooking(property._id, session)) {
        const pending = await propertyRepository.findPendingLifecycleRequest(property._id, session);
        if (pending) return { request: pending };
        const request = await createLifecycleRequest({
          property,
          actor,
          action: 'archive',
          reason,
          session
        });
        return { request };
      }

      return applyArchive(property, actor, reason, session);
    });
  },

  async softDelete(id, actor, reason) {
    assertCanDeleteAny(actor);
    const data = parseOrThrow(softDeleteSchema, { reason });
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property || property.deletedAt) throw notFound('Property not found');
      return applySoftDelete(property, actor, data.reason, session);
    });
  },

  async unarchive(id, actor, reason = null) {
    assertAdminActor(actor);
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property || property.deletedAt) throw notFound('Property not found');
      const before = safeSnapshot(property);
      property.listingStatus = property.approvalStatus === APPROVAL_STATUS.APPROVED
        ? LISTING_STATUS.PUBLISHED
        : LISTING_STATUS.DRAFT;
      property.archivedAt = null;
      property.archivedBy = null;
      await property.save({ session });
      await publishEvent(EVENT_TYPES.PROPERTY_UPDATED, {
        propertyId: String(property._id),
        listingStatus: property.listingStatus,
        action: 'unarchive'
      }, actor, actor?.correlationId, session);
      await recordAudit('PROPERTY_UNARCHIVED', property._id, before, safeSnapshot(property), actor, reason, {}, session);
      return property;
    });
  },

  async update(id, input, actor) {
    assertAuthenticated(actor);
    const parsed = parseOrThrow(updatePropertySchema, input);
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.PROPERTY_UPDATE_OWN);

    const reason = parsed.reason || null;
    if (await propertiesService.hasActiveConfirmedBooking(property._id)) {
      const changes = await prepareChanges(property, parsed);
      const currentSnapshot = safeSnapshot(property);
      const proposedSnapshot = assignChanges(clone(currentSnapshot), changes);
      const changeSummary = diffObjects(editableSnapshot(currentSnapshot), editableSnapshot(proposedSnapshot));
      const changeRequest = await ChangeRequest.create({
        propertyId: property._id,
        ownerId: property.ownerId,
        status: 'pending',
        reason,
        requestedChanges: publicChanges(changes),
        currentSnapshot,
        proposedSnapshot,
        changeSummary
      });
      return { changeRequest };
    }

    return withTransaction(async (session) => {
      const fresh = await propertyRepository.findById(id, session);
      if (!fresh || fresh.deletedAt) throw notFound('Property not found');
      assertCanManage(fresh, actor, PERMISSIONS.PROPERTY_UPDATE_OWN);
      const changes = await prepareChanges(fresh, parsed);
      const before = safeSnapshot(fresh);
      assignChanges(fresh, changes);
      if (changes.mediaOrder) await applyMediaOrder(fresh._id, changes.mediaOrder);
      fresh.searchKeywords = buildSearchKeywords(fresh);
      await fresh.save({ session });
      await publishEvent(EVENT_TYPES.PROPERTY_UPDATED, {
        propertyId: String(fresh._id),
        fields: Object.keys(changes),
        changeRequestVersion: fresh.changeRequestVersion
      }, actor, actor?.correlationId, session);
      await recordAudit(EVENT_TYPES.PROPERTY_UPDATED, fresh._id, before, safeSnapshot(fresh), actor, reason, { fields: Object.keys(changes) }, session);
      return fresh;
    });
  },

  async listAdmin(query = {}) {
    const result = await propertyRepository.listAdmin(query);
    return { properties: result.items, meta: result.meta };
  },

  async listChangeRequests(ownerId = null, query = {}) {
    const result = await propertyRepository.listChangeRequests({ ownerId, status: query.status }, query);
    return { requests: result.items, meta: result.meta };
  },

  async getChangeRequest(id) {
    const changeRequest = await propertyRepository.findChangeRequestById(id);
    if (!changeRequest) throw notFound('Change request not found');
    return changeRequest;
  },

  async reviewChangeRequest(id, decision, actor, note = null) {
    assertAdminActor(actor);
    const parsedDecision = parseOrThrow(reviewDecisionSchema, decision);
    return withTransaction(async (session) => {
      const changeRequest = await propertyRepository.findChangeRequestById(id, session);
      if (!changeRequest) throw notFound('Change request not found');
      if (changeRequest.status !== 'pending') throw conflict('INVALID_STATE', 'Change request is already reviewed');
      const property = await propertyRepository.findById(changeRequest.propertyId, session);
      if (!property || property.deletedAt) throw notFound('Property not found');

      const before = safeSnapshot(property);
      if (parsedDecision === 'reject') {
        if (!note || !String(note).trim()) throw badRequest('A rejection reason is required');
        changeRequest.status = 'rejected';
        changeRequest.review = {
          reviewedBy: actorId(actor),
          reviewedAt: new Date(),
          reason: String(note).trim(),
          note: null
        };
        await changeRequest.save({ session });
        await auditService.record({
          actor: actorMeta(actor),
          action: 'PROPERTY_CHANGE_REQUEST_REJECTED',
          entityType: 'changeRequest',
          entityId: String(changeRequest._id),
          before: null,
          after: clone(changeRequest),
          reason: String(note).trim(),
          metadata: { propertyId: String(property._id) }
        }, session);
        return changeRequest;
      }

      const snapshotVersion = Number(changeRequest.currentSnapshot?.changeRequestVersion);
      if (!Number.isInteger(snapshotVersion) || snapshotVersion !== Number(property.changeRequestVersion)) {
        throw conflict('STALE_SNAPSHOT', 'Property changed since this request was created');
      }

      const changes = await prepareChanges(property, toPlain(changeRequest.requestedChanges) || {});
      assignChanges(property, changes);
      if (changes.mediaOrder) {
        await applyMediaOrder(property._id, changes.mediaOrder);
      }
      property.searchKeywords = buildSearchKeywords(property);
      property.changeRequestVersion = Number(property.changeRequestVersion || 0) + 1;
      await property.save({ session });

      const now = new Date();
      changeRequest.status = 'approved';
      changeRequest.review = {
        reviewedBy: actorId(actor),
        reviewedAt: now,
        reason: note || null,
        note: note || null
      };
      changeRequest.appliedAt = now;
      changeRequest.appliedVersion = property.changeRequestVersion;
      await changeRequest.save({ session });

      await publishEvent(EVENT_TYPES.PROPERTY_UPDATED, {
        propertyId: String(property._id),
        changeRequestId: String(changeRequest._id),
        changeRequestVersion: property.changeRequestVersion,
        action: 'changeRequestApplied'
      }, actor, actor?.correlationId, session);
      await recordAudit('PROPERTY_CHANGE_REQUEST_APPLIED', property._id, before, safeSnapshot(property), actor, note, {
        changeRequestId: String(changeRequest._id),
        changeRequestVersion: property.changeRequestVersion
      }, session);
      return property;
    });
  },

  async listDuplicates(query = {}) {
    const result = await propertyRepository.listDuplicates({
      status: query.status,
      minScore: query.minScore
    }, query);
    return { flags: result.items, meta: result.meta };
  },

  async reviewDuplicate(id, decision, actor, note = null) {
    assertAdminActor(actor);
    const parsedDecision = parseOrThrow(duplicateDecisionSchema, decision);
    return withTransaction(async (session) => {
      const flag = await propertyRepository.findDuplicateFlagById(id, session);
      if (!flag) throw notFound('Duplicate flag not found');
      if (flag.status !== 'pending') throw conflict('INVALID_STATE', 'Duplicate flag is already reviewed');
      flag.status = parsedDecision === 'confirm' ? 'confirmed' : 'dismissed';
      flag.reviewedBy = actorId(actor);
      flag.reviewedAt = new Date();
      flag.note = note || null;
      await flag.save({ session });
      await auditService.record({
        actor: actorMeta(actor),
        action: parsedDecision === 'confirm' ? 'DUPLICATE_CONFIRMED' : 'DUPLICATE_DISMISSED',
        entityType: 'property',
        entityId: String(flag._id),
        before: null,
        after: clone(flag),
        reason: note || null,
        metadata: { propertyId: String(flag.propertyId), score: flag.score }
      }, session);
      return flag;
    });
  },

  async getApprovalHistory(propertyId, query = {}) {
    const property = await propertyRepository.findById(propertyId);
    if (!property) throw notFound('Property not found');
    const result = await propertyRepository.listApprovalHistory(propertyId, query);
    return { approvalHistory: result.items, meta: result.meta };
  },

  async getChangeRequestsForProperty(propertyId, query = {}) {
    const property = await propertyRepository.findById(propertyId);
    if (!property) throw notFound('Property not found');
    const result = await propertyRepository.listChangeRequests({ propertyId }, query);
    return { changeRequests: result.items, meta: result.meta };
  },

  async requestDelete(id, actor, reason) {
    assertAuthenticated(actor);
    const data = parseOrThrow(lifecycleRequestCreateSchema, { reason });
    return withTransaction(async (session) => {
      const property = await propertyRepository.findById(id, session);
      if (!property) throw notFound('Property not found');
      if (property.deletedAt) {
        throw conflict('PROPERTY_ALREADY_DELETED', 'Property has already been deleted');
      }
      assertCanRequestLifecycle(property, actor);
      const pending = await propertyRepository.findPendingLifecycleRequest(property._id, session);
      if (pending) {
        throw conflict('LIFECYCLE_REQUEST_PENDING', 'A lifecycle request is already pending for this property');
      }
      return createLifecycleRequest({
        property,
        actor,
        action: 'delete',
        reason: data.reason,
        session
      });
    });
  },

  async listMyLifecycleRequests(actor, query = {}) {
    assertAuthenticated(actor);
    const parsed = parseOrThrow(lifecycleRequestListQuerySchema, query);
    const result = await propertyRepository.listLifecycleRequests({ ownerId: actorId(actor) }, parsed);
    return { requests: result.items, meta: result.meta };
  },

  async getLifecycleRequestsForProperty(propertyId, actor, query = {}) {
    assertAuthenticated(actor);
    const parsed = parseOrThrow(lifecycleRequestListQuerySchema, query);
    const property = await propertyRepository.findById(propertyId);
    if (!property) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.PROPERTY_READ_OWN);
    const result = await propertyRepository.listLifecycleRequests({ propertyId: property._id }, parsed);
    return { requests: result.items, meta: result.meta };
  },

  async listAllLifecycleRequests(query = {}, actor = null) {
    assertAdminActor(actor);
    const parsed = parseOrThrow(lifecycleRequestListQuerySchema, query);
    const result = await propertyRepository.listLifecycleRequests({}, parsed);
    return { requests: result.items, meta: result.meta };
  },

  async getLifecycleRequest(id, actor) {
    assertAdminActor(actor);
    const request = await propertyRepository.findLifecycleRequestById(id);
    if (!request) throw notFound('Lifecycle request not found');
    return request;
  },

  async reviewLifecycleRequest(id, decision, actor, input = {}) {
    assertAdminActor(actor);
    const parsedDecision = parseOrThrow(reviewDecisionSchema, decision);
    const parsed = parsedDecision === 'approve'
      ? parseOrThrow(lifecycleApproveSchema, input || {})
      : parseOrThrow(lifecycleRejectSchema, input || {});
    const note = parsedDecision === 'approve' ? (parsed.note || parsed.reason || null) : parsed.reason;

    return withTransaction(async (session) => {
      const request = await propertyRepository.findLifecycleRequestById(id, session);
      if (!request) throw notFound('Lifecycle request not found');
      if (request.status !== 'pending') {
        throw conflict('INVALID_STATE', 'Lifecycle request is already reviewed');
      }
      const property = await propertyRepository.findById(request.propertyId, session);
      if (!property) throw notFound('Property not found');
      if (property.deletedAt) {
        throw conflict('PROPERTY_ALREADY_DELETED', 'Property has already been deleted');
      }

      const before = safeSnapshot(property);
      if (parsedDecision === 'approve') {
        if (request.action === 'archive') {
          await applyArchive(property, actor, request.reason, session);
        } else if (request.action === 'delete') {
          // Admin review supersedes the direct-delete history guard: booked listings
          // are exactly what this workflow is designed to resolve.
          await applySoftDelete(property, actor, request.reason, session, { skipHistoryCheck: true });
        } else {
          throw badRequest('Unsupported lifecycle action');
        }
        request.status = 'approved';
      } else {
        request.status = 'rejected';
      }

      const now = new Date();
      request.reviewedBy = actorId(actor);
      request.reviewedAt = now;
      request.note = note;
      await request.save({ session });

      await publishEvent(EVENT_TYPES.PROPERTY_LIFECYCLE_RESOLVED, {
        propertyId: String(property._id),
        ownerId: String(property.ownerId),
        title: property.title,
        requestId: String(request._id),
        action: request.action,
        decision: parsedDecision,
        status: request.status,
        reason: note || request.reason || null,
        note,
        reviewedBy: String(actorId(actor) || 'system'),
        reviewedAt: now.toISOString()
      }, actor, actor?.correlationId, session);
      await recordLifecycleAudit(
        EVENT_TYPES.PROPERTY_LIFECYCLE_RESOLVED,
        property._id,
        request,
        actor,
        note,
        before,
        safeSnapshot(property),
        session
      );
      return { request, property };
    });
  },

  async attachMedia(id, files, actor, correlationId = null) {
    assertAuthenticated(actor);
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.MEDIA_MANAGE_OWN);
    const list = asArray(files, ['files', 'images']);
    if (!list.length) throw badRequest('At least one image is required');

    const maxImages = Number(property.media?.maxImages) || appConfig.defaults.maxImagesPerProperty;
    const currentCount = Number(property.media?.imageCount) || 0;
    if (currentCount + list.length > maxImages) {
      throw conflict('MEDIA_LIMIT_REACHED', `A property can have at most ${maxImages} images`);
    }

    const created = asArray(await mediaService.attach(
      { type: 'property', id: property._id },
      list,
      actorMeta(actor),
      correlationId || actor?.correlationId || null
    ), ['media', 'items']);
    const cover = created.find((item) => item?.isCover);
    const update = { $set: { 'media.imageCount': Math.min(maxImages, currentCount + created.length) } };
    if (cover && !property.media?.coverMediaId) {
      update.$set['media.coverMediaId'] = cover._id;
    }
    await Property.updateOne({ _id: property._id }, update);
    return created;
  },

  async setCover(id, mediaId, actor, correlationId = null) {
    assertAuthenticated(actor);
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.MEDIA_MANAGE_OWN);
    const result = await mediaService.setCover('property', property._id, mediaId);
    const coverId = mediaIdFrom(result) || mediaId;
    await Property.updateOne({ _id: property._id }, { $set: { 'media.coverMediaId': coverId } });
    return result;
  },

  async reorderMedia(id, orders, actor, correlationId = null) {
    assertAuthenticated(actor);
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.MEDIA_MANAGE_OWN);
    return applyMediaOrder(property._id, asArray(orders, ['orders', 'media']));
  },

  async removeMedia(id, mediaId, actor, correlationId = null) {
    assertAuthenticated(actor);
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.MEDIA_MANAGE_OWN);
    const result = await mediaService.remove(mediaId, {
      ...actorMeta(actor),
      correlationId: correlationId || actor?.correlationId || null
    });
    const removedId = mediaIdFrom(result) || mediaId;
    const updates = {};
    if (Number(property.media?.imageCount) > 0) {
      updates['media.imageCount'] = Number(property.media.imageCount) - 1;
    }
    if (String(property.media?.coverMediaId) === String(removedId)) updates['media.coverMediaId'] = null;
    if (Object.keys(updates).length) await Property.updateOne({ _id: property._id }, { $set: updates });
    return result;
  },

  async blockDates(id, input, actor, note = null) {
    assertAuthenticated(actor);
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.AVAILABILITY_MANAGE_OWN);

    const payload = Array.isArray(input) ? { dates: input } : toPlain(input) || {};
    if (!note && payload.note) note = payload.note;
    const parsed = parseOrThrow(blockDatesSchema, payload);

    if (!parsed.dates?.length) {
      const before = safeSnapshot(property);
      const changes = { availability: normalizeAvailability(parsed, toPlain(property.availability) || {}) };
      assignChanges(property, changes);
      await property.save();
      await recordAudit(EVENT_TYPES.PROPERTY_UPDATED, property._id, before, safeSnapshot(property), actor, note, { availability: true });
      return [];
    }

    const dates = [...new Set(parsed.dates.map((value) => {
      try {
        return toDateOnly(value).toISOString();
      } catch {
        throw badRequest('Invalid date in dates array');
      }
    }))].map((value) => new Date(value));

    return withTransaction(async (session) => {
      const existing = await AvailabilityReservation.find({
        propertyId: property._id,
        date: { $in: dates }
      }).session(session).lean();
      if (existing.length) {
        throw conflict('DATE_CONFLICT', 'One or more dates are already reserved');
      }
      const reservations = await AvailabilityReservation.create(dates.map((date) => ({
        propertyId: property._id,
        date,
        bookingId: null,
        source: RESERVATION_SOURCES.OWNER_BLOCK,
        note: note || null,
        createdBy: actorId(actor)
      })), { session });
      await propertiesService.recomputeAvailability(property._id, session);
      return reservations;
    });
  },

  async unblock(id, reservationId, actor) {
    assertAuthenticated(actor);
    const property = await propertyRepository.findById(id);
    if (!property || property.deletedAt) throw notFound('Property not found');
    assertCanManage(property, actor, PERMISSIONS.AVAILABILITY_MANAGE_OWN);

    return withTransaction(async (session) => {
      const reservation = await AvailabilityReservation.findOne({
        _id: reservationId,
        propertyId: property._id,
        source: RESERVATION_SOURCES.OWNER_BLOCK
      }).session(session);
      if (!reservation) throw notFound('Owner block not found');
      await reservation.deleteOne({ session });
      await propertiesService.recomputeAvailability(property._id, session);
      return reservation;
    });
  },

  async getAvailability(id, checkIn, checkOut) {
    const parsed = parseOrThrow(availabilityQuerySchema, { checkIn, checkOut });
    const property = await propertiesService.getPublicById(id);
    const start = toDateOnly(parsed.checkIn);
    const end = toDateOnly(parsed.checkOut);
    const today = toDateOnly(new Date());
    const earliest = addDays(today, Number(property.availability?.leadTimeDays) || 0);
    const latest = addDays(today, Number(property.availability?.maxAdvanceDays) || appConfig.defaults.maxAdvanceDays);

    if (start < earliest || end > latest) {
      return { available: false, reason: 'OUTSIDE_BOOKING_WINDOW' };
    }
    if (property.availability?.isOpenForBooking === false) {
      return { available: false, reason: 'BOOKINGS_CLOSED' };
    }
    if (!property.bookingConfig?.sameDayCheckInAllowed && start <= today) {
      return { available: false, reason: 'SAME_DAY_CHECK_IN_NOT_ALLOWED' };
    }

    const rates = asArray(property.pricing?.rates, ['rates']);
    const rentalPeriods = asArray(property.rentalPeriods).map(String);
    if (!rates.length || !rentalPeriods.length || !property.pricing?.currency
      || !rentalPeriods.includes(property.pricing.defaultPeriod)) {
      return { available: false, reason: 'PROPERTY_NOT_BOOKABLE' };
    }

    const conflicting = await AvailabilityReservation.exists({
      propertyId: property._id,
      date: { $gte: start, $lt: end }
    });
    if (conflicting) return { available: false, reason: 'DATE_CONFLICT' };

    return { available: true, reason: null };
  }
};

export default propertiesService;
