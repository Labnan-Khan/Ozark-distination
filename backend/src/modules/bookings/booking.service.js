import mongoose from 'mongoose';
import { withTransaction } from '../../config/database.js';
import {
  BOOKING_STATUS,
  EVENT_TYPES,
  RESERVATION_SOURCES,
  ROLES
} from '../../shared/constants/index.js';
import { badRequest, conflict, forbidden, notFound } from '../../shared/errors/index.js';
import {
  buildPaginationMeta,
  generateBookingReference,
  parsePagination,
  toDateOnly
} from '../../shared/utils/index.js';
import { isAdmin } from '../../shared/services/index.js';
import { eventBus } from '../../infrastructure/events/index.js';
import { Booking } from './booking.model.js';
import { BookingHistory } from './bookingHistory.model.js';
import { availabilityService } from './availability.service.js';
import { pricingService } from './pricing.service.js';
import { policyService } from './policy.service.js';
import { assertTransition, isActive } from './booking.stateMachine.js';

function actorInfo(actor) {
  if (!actor) return null;
  return {
    userId: String(actor._id),
    role: Array.isArray(actor.roles) ? actor.roles[0] : actor.roles
  };
}

function bookingEvent(type, booking, actor, extra = {}) {
  return {
    type,
    actor: actorInfo(actor),
    payload: {
      bookingId: String(booking._id),
      reference: booking.reference,
      propertyId: String(booking.propertyId),
      customerId: String(booking.customerId),
      ownerId: String(booking.ownerId),
      title: booking.propertySnapshot?.title,
      ...extra
    },
    correlationId: actor?.correlationId || null,
    idempotencyKey: `${type}:${booking._id}:${extra.suffix || 'default'}`
  };
}

async function historyEntry(booking, from, to, action, actor, extra = {}, session) {
  await BookingHistory.create([{
    bookingId: booking._id,
    fromStatus: from,
    toStatus: to,
    action,
    actorId: actor._id,
    actorRole: actorInfo(actor)?.role || 'system',
    reason: extra.reason || null,
    note: extra.note || null,
    metadata: extra.metadata || {}
  }], { session });
}

async function dispatch() {
  await eventBus.dispatchPending();
}

function propertySummary(snapshot) {
  const address = snapshot.address || {};
  return {
    id: String(snapshot._id),
    title: snapshot.title,
    categoryId: snapshot.categoryId ? String(snapshot.categoryId) : null,
    categorySnapshot: snapshot.categorySnapshot || null,
    addressSummary: [address.area, address.city, address.country].filter(Boolean).join(', '),
    city: address.city || null,
    ownerSnapshot: snapshot.ownerSnapshot || null,
    coverMediaUrl: snapshot.media?.coverMediaId ? String(snapshot.media.coverMediaId) : null,
    pricingVersion: snapshot.pricing?.version || 1
  };
}

async function loadPropertySnapshot(propertyId) {
  const { propertiesService } = await import('../properties/index.js');
  return propertiesService.getBookableSnapshot(propertyId);
}

async function assertRelation(booking, actor) {
  if (isAdmin(actor)) return;
  const roles = Array.isArray(actor.roles) ? actor.roles : [actor.roles];
  if (roles.includes(ROLES.CUSTOMER) && String(booking.customerId) === String(actor._id)) return;
  if (roles.includes(ROLES.OWNER) && String(booking.ownerId) === String(actor._id)) return;
  throw forbidden('You are not related to this booking');
}

function assertOwnerOrAdmin(booking, actor) {
  if (isAdmin(actor)) return;
  const roles = Array.isArray(actor.roles) ? actor.roles : [actor.roles];
  if (roles.includes(ROLES.OWNER) && String(booking.ownerId) === String(actor._id)) return;
  throw forbidden('Only the property owner or an administrator can perform this action');
}

export const bookingsService = {
  async create(input, actor, meta = {}) {
    const { propertyId, checkIn, checkOut, rentalPeriod, guests, specialRequests, customerId } = input;
    const snapshot = await loadPropertySnapshot(propertyId);
    pricingService.assertWindow(snapshot, checkIn, checkOut);
    const priceSnapshot = pricingService.calculate(snapshot, { checkIn, checkOut, rentalPeriod, guests });
    const status = pricingService.statusForMode(snapshot.bookingConfig.mode);
    const actorRoles = Array.isArray(actor.roles) ? actor.roles : [actor.roles];
    const effectiveCustomerId = actorRoles.includes(ROLES.ADMIN) ? customerId : actor._id;
    if (!effectiveCustomerId) throw badRequest('customerId is required for admin-created bookings');

    const bookingId = new mongoose.Types.ObjectId();
    const start = toDateOnly(checkIn);
    const end = toDateOnly(checkOut);
    const events = [];

    try {
      const booking = await withTransaction(async (session) => {
        if (status === BOOKING_STATUS.CONFIRMED) {
          await availabilityService.assertRangeFree(propertyId, start, end, session);
          await availabilityService.createReservations(propertyId, start, end, {
            bookingId,
            source: RESERVATION_SOURCES.BOOKING,
            actorId: actor._id
          }, session);
          await this.recomputeAvailability(propertyId, session);
        }

        const [created] = await Booking.create([{
          _id: bookingId,
          reference: generateBookingReference(),
          customerId: effectiveCustomerId,
          ownerId: snapshot.ownerId,
          propertyId: snapshot._id,
          propertySnapshot: propertySummary(snapshot),
          checkInDate: start,
          checkOutDate: end,
          rentalPeriod,
          units: priceSnapshot.units,
          guests: guests || null,
          priceSnapshot,
          bookingModeSnapshot: snapshot.bookingConfig.mode,
          status,
          source: actorRoles.includes(ROLES.ADMIN) ? 'admin' : 'customer',
          specialRequests: specialRequests || null,
          cancellation: { status: 'none' }
        }], { session });

        await historyEntry(created, status, status, 'create', actor, {}, session);
        events.push(bookingEvent(
          status === BOOKING_STATUS.CONFIRMED ? EVENT_TYPES.BOOKING_CONFIRMED : EVENT_TYPES.BOOKING_REQUESTED,
          created,
          actor
        ));
        await eventBus.publishMany(events, session);
        return created;
      });
      await dispatch();
      return booking;
    } catch (error) {
      if (error?.code === 11000) {
        throw conflict('BOOKING_DATE_CONFLICT', 'Selected dates are no longer available');
      }
      throw error;
    }
  },

  async getById(id, actor) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    await assertRelation(booking, actor);
    return booking;
  },

  async getHistory(id, actor) {
    await this.getById(id, actor);
    return BookingHistory.find({ bookingId: id }).sort({ createdAt: -1 }).lean();
  },

  async listForCustomer(customerId, query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { customerId };
    if (query.status) filter.status = query.status;
    if (query.from) filter.checkInDate = { $gte: toDateOnly(query.from) };
    if (query.to) filter.checkOutDate = { $lte: toDateOnly(query.to) };
    const [items, total] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter)
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async listForOwner(ownerId, query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = { ownerId };
    if (query.status) filter.status = query.status;
    if (query.propertyId) filter.propertyId = query.propertyId;
    const [items, total] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter)
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async listAll(query = {}) {
    const { page, limit, skip } = parsePagination(query);
    const filter = {};
    for (const key of ['status', 'customerId', 'ownerId', 'propertyId']) {
      if (query[key]) filter[key] = query[key];
    }
    if (query.from || query.to) {
      filter.createdAt = {};
      if (query.from) filter.createdAt.$gte = new Date(query.from);
      if (query.to) filter.createdAt.$lte = new Date(query.to);
    }
    const [items, total] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Booking.countDocuments(filter)
    ]);
    return { items, meta: buildPaginationMeta({ page, limit, total }) };
  },

  async getActiveBookingsForUser(userId) {
    return Booking.find({
      status: BOOKING_STATUS.CONFIRMED,
      checkOutDate: { $gt: new Date() },
      $or: [{ customerId: userId }, { ownerId: userId }]
    }).lean();
  },

  async approve(id, actor, note = null) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    assertOwnerOrAdmin(booking, actor);
    assertTransition(booking.status, BOOKING_STATUS.CONFIRMED);
    const events = [];
    const updated = await withTransaction(async (session) => {
      await availabilityService.assertRangeFree(booking.propertyId, booking.checkInDate, booking.checkOutDate, session);
      await availabilityService.createReservations(booking.propertyId, booking.checkInDate, booking.checkOutDate, {
        bookingId: booking._id,
        source: RESERVATION_SOURCES.BOOKING,
        actorId: actor._id
      }, session);
      await this.recomputeAvailability(booking.propertyId, session);

      const from = booking.status;
      booking.status = BOOKING_STATUS.CONFIRMED;
      booking.approval = { approvedBy: actor._id, approvedAt: new Date(), note };
      await booking.save({ session });
      await historyEntry(booking, from, BOOKING_STATUS.CONFIRMED, 'approve', actor, { note }, session);
      events.push(bookingEvent(EVENT_TYPES.BOOKING_CONFIRMED, booking, actor, { suffix: 'approved' }));
      await eventBus.publishMany(events, session);
      return booking;
    });
    await dispatch();
    return updated;
  },

  async reject(id, actor, reason) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    assertOwnerOrAdmin(booking, actor);
    assertTransition(booking.status, BOOKING_STATUS.REJECTED);
    if (!reason) throw badRequest('Reason is required');
    const events = [];
    const updated = await withTransaction(async (session) => {
      const from = booking.status;
      booking.status = BOOKING_STATUS.REJECTED;
      await booking.save({ session });
      await historyEntry(booking, from, BOOKING_STATUS.REJECTED, 'reject', actor, { reason }, session);
      events.push(bookingEvent(EVENT_TYPES.BOOKING_REJECTED, booking, actor, { reason, suffix: 'rejected' }));
      await eventBus.publishMany(events, session);
      return booking;
    });
    await dispatch();
    return updated;
  },

  async requestCancellation(id, actor, reason) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    const roles = Array.isArray(actor.roles) ? actor.roles : [actor.roles];
    if (!isAdmin(actor) && !(roles.includes(ROLES.CUSTOMER) && String(booking.customerId) === String(actor._id))) {
      throw forbidden('Only the booking customer can request cancellation');
    }
    if (!policyService.canCustomerRequestCancellation(booking)) throw badRequest('Cancellation cannot be requested in this state');
    if (!reason) throw badRequest('Reason is required');
    assertTransition(booking.status, BOOKING_STATUS.CANCELLATION_REQUESTED);
    const events = [];
    const updated = await withTransaction(async (session) => {
      const from = booking.status;
      booking.statusBeforeCancellationRequest = from;
      booking.status = BOOKING_STATUS.CANCELLATION_REQUESTED;
      booking.cancellation = {
        status: 'requested',
        reason,
        requestedBy: actor._id,
        requestedAt: new Date()
      };
      await booking.save({ session });
      await historyEntry(booking, from, BOOKING_STATUS.CANCELLATION_REQUESTED, 'request_cancellation', actor, { reason }, session);
      events.push(bookingEvent(EVENT_TYPES.CANCELLATION_REQUESTED, booking, actor, { reason, suffix: 'requested' }));
      await eventBus.publishMany(events, session);
      return booking;
    });
    await dispatch();
    return updated;
  },

  async reviewCancellation(id, decision, actor, note = null) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    assertOwnerOrAdmin(booking, actor);
    if (booking.status !== BOOKING_STATUS.CANCELLATION_REQUESTED) throw badRequest('No cancellation request is pending');
    const target = decision === 'approve' ? BOOKING_STATUS.CANCELLED : booking.statusBeforeCancellationRequest || BOOKING_STATUS.CONFIRMED;
    assertTransition(booking.status, target);
    const events = [];
    const updated = await withTransaction(async (session) => {
      const from = booking.status;
      booking.status = target;
      booking.cancellation.reviewedBy = actor._id;
      booking.cancellation.reviewedAt = new Date();
      booking.cancellation.status = decision === 'approve' ? 'approved' : 'rejected';
      booking.cancellation.note = note;
      await booking.save({ session });
      if (decision === 'approve') {
        await availabilityService.releaseReservations(booking._id, session);
        await this.recomputeAvailability(booking.propertyId, session);
      }
      await historyEntry(booking, from, target, decision === 'approve' ? 'approve_cancellation' : 'reject_cancellation', actor, { note }, session);
      events.push(bookingEvent(EVENT_TYPES.CANCELLATION_RESOLVED, booking, actor, {
        decision,
        suffix: `review:${decision}`
      }));
      if (decision === 'approve') {
        events.push(bookingEvent(EVENT_TYPES.BOOKING_CANCELLED, booking, actor, { suffix: 'cancelled' }));
      }
      await eventBus.publishMany(events, session);
      return booking;
    });
    await dispatch();
    return updated;
  },

  async cancel(id, actor, reason) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    policyService.assertDirectCancellation(actor, booking);
    assertTransition(booking.status, BOOKING_STATUS.CANCELLED);
    if (!reason) throw badRequest('Reason is required');
    const events = [];
    const updated = await withTransaction(async (session) => {
      const from = booking.status;
      booking.status = BOOKING_STATUS.CANCELLED;
      booking.cancellation = {
        status: String(booking.customerId) === String(actor._id) ? 'requested' : 'admin_cancelled',
        reason,
        requestedBy: actor._id,
        requestedAt: new Date(),
        reviewedBy: actor._id,
        reviewedAt: new Date(),
        note: 'Direct cancellation'
      };
      await booking.save({ session });
      await availabilityService.releaseReservations(booking._id, session);
      await this.recomputeAvailability(booking.propertyId, session);
      await historyEntry(booking, from, BOOKING_STATUS.CANCELLED, 'cancel', actor, { reason }, session);
      events.push(bookingEvent(EVENT_TYPES.BOOKING_CANCELLED, booking, actor, { reason, suffix: 'direct' }));
      await eventBus.publishMany(events, session);
      return booking;
    });
    await dispatch();
    return updated;
  },

  async complete(id, actor) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    assertOwnerOrAdmin(booking, actor);
    assertTransition(booking.status, BOOKING_STATUS.COMPLETED);
    const events = [];
    const updated = await withTransaction(async (session) => {
      const from = booking.status;
      booking.status = BOOKING_STATUS.COMPLETED;
      await booking.save({ session });
      await this.recomputeAvailability(booking.propertyId, session);
      await historyEntry(booking, from, BOOKING_STATUS.COMPLETED, 'complete', actor, {}, session);
      events.push(bookingEvent(EVENT_TYPES.BOOKING_COMPLETED, booking, actor));
      await eventBus.publishMany(events, session);
      return booking;
    });
    await dispatch();
    return updated;
  },

  async modifyDates(id, input, actor) {
    const booking = await Booking.findById(id);
    if (!booking) throw notFound('Booking not found');
    if (!isAdmin(actor)) throw forbidden('Only administrators can modify confirmed booking dates');
    const snapshot = await loadPropertySnapshot(booking.propertyId);
    pricingService.assertWindow(snapshot, input.checkIn, input.checkOut);
    const priceSnapshot = pricingService.calculate(snapshot, {
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      rentalPeriod: booking.rentalPeriod,
      guests: booking.guests
    });
    const start = toDateOnly(input.checkIn);
    const end = toDateOnly(input.checkOut);
    const events = [];
    const updated = await withTransaction(async (session) => {
      await availabilityService.releaseReservations(booking._id, session);
      await availabilityService.assertRangeFree(booking.propertyId, start, end, session);
      await availabilityService.createReservations(booking.propertyId, start, end, {
        bookingId: booking._id,
        actorId: actor._id
      }, session);
      await this.recomputeAvailability(booking.propertyId, session);
      const from = booking.status;
      booking.checkInDate = start;
      booking.checkOutDate = end;
      booking.units = priceSnapshot.units;
      booking.priceSnapshot = priceSnapshot;
      await booking.save({ session });
      await historyEntry(booking, from, booking.status, 'modify_dates', actor, {
        note: `${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}`
      }, session);
      events.push(bookingEvent(EVENT_TYPES.BOOKING_MODIFIED, booking, actor, { suffix: 'dates' }));
      await eventBus.publishMany(events, session);
      return booking;
    });
    await dispatch();
    return updated;
  },

  async getAvailability(propertyId, checkIn, checkOut) {
    const snapshot = await loadPropertySnapshot(propertyId);
    try {
      pricingService.assertWindow(snapshot, checkIn, checkOut);
    } catch (error) {
      return { available: false, reason: error.message };
    }
    const available = await availabilityService.isRangeAvailable(propertyId, checkIn, checkOut);
    return {
      available,
      reason: available ? null : 'Selected dates are no longer available',
      quotedPrice: available ? snapshot.pricing : undefined
    };
  },

  async hasActiveConfirmedBooking(propertyId) {
    const count = await Booking.countDocuments({
      propertyId,
      status: BOOKING_STATUS.CONFIRMED,
      checkOutDate: { $gt: new Date() }
    });
    return count > 0;
  },

  async recomputeAvailability(propertyId, session = null) {
    const { propertiesService } = await import('../properties/index.js');
    return propertiesService.recomputeAvailability(propertyId, session);
  },

  isActive
};
