import { AvailabilityReservation } from './reservation.model.js';
import { BOOKING_STATUS, RESERVATION_SOURCES } from '../../shared/constants/index.js';
import { conflict } from '../../shared/errors/index.js';
import { eachDateInRange, toDateOnly } from '../../shared/utils/index.js';

export const availabilityService = {
  async assertRangeFree(propertyId, checkIn, checkOut, session) {
    const start = toDateOnly(checkIn);
    const end = toDateOnly(checkOut);
    const query = AvailabilityReservation.find({
      propertyId,
      date: { $gte: start, $lt: end }
    }).limit(1);
    if (session) query.session(session);
    const existing = await query.lean();
    if (existing.length) {
      throw conflict('BOOKING_DATE_CONFLICT', 'Selected dates are no longer available');
    }
  },

  async createReservations(propertyId, checkIn, checkOut, { bookingId = null, source = RESERVATION_SOURCES.BOOKING, actorId = null, note = null } = {}, session) {
    const docs = eachDateInRange(toDateOnly(checkIn), toDateOnly(checkOut)).map((date) => ({
      propertyId,
      date,
      bookingId,
      source,
      createdBy: actorId,
      note
    }));
    if (!docs.length) return [];
    try {
      return await AvailabilityReservation.create(docs, { session, ordered: true });
    } catch (error) {
      if (error?.code === 11000) {
        throw conflict('BOOKING_DATE_CONFLICT', 'Selected dates are no longer available');
      }
      throw error;
    }
  },

  async releaseReservations(bookingId, session) {
    return AvailabilityReservation.deleteMany({ bookingId }, session ? { session } : undefined);
  },

  async isRangeAvailable(propertyId, checkIn, checkOut) {
    try {
      await this.assertRangeFree(propertyId, checkIn, checkOut);
      return true;
    } catch (error) {
      if (error.code === 'BOOKING_DATE_CONFLICT') return false;
      throw error;
    }
  },

  async bookedDates(propertyId, from, to) {
    const bookings = await (await import('./booking.model.js')).Booking.find({
      propertyId,
      status: BOOKING_STATUS.CONFIRMED,
      checkOutDate: { $gt: from }
    }).lean();
    return bookings.filter((booking) => new Date(booking.checkInDate) < new Date(to));
  }
};
