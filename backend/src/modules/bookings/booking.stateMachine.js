import { BOOKING_STATUS, BOOKING_TRANSITIONS } from '../../shared/constants/index.js';
import { invalidState } from '../../shared/errors/index.js';

export function assertTransition(from, to) {
  const allowed = BOOKING_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw invalidState(`Cannot change booking from ${from} to ${to}`);
  }
}

export function isActive(booking) {
  return booking.status === BOOKING_STATUS.CONFIRMED && new Date(booking.checkOutDate) > new Date();
}

export function isOverlappingBooking(booking, start, end) {
  return new Date(booking.checkInDate) < new Date(end) && new Date(start) < new Date(booking.checkOutDate);
}
