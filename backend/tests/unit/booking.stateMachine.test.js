import { describe, expect, it } from '@jest/globals';
import { BOOKING_STATUS } from '../../src/shared/constants/index.js';
import { assertTransition } from '../../src/modules/bookings/booking.stateMachine.js';

describe('booking state machine', () => {
  it('allows valid confirmation from pending', () => {
    expect(() => assertTransition(BOOKING_STATUS.PENDING, BOOKING_STATUS.CONFIRMED)).not.toThrow();
  });

  it('blocks rejected bookings from becoming confirmed', () => {
    expect(() => assertTransition(BOOKING_STATUS.REJECTED, BOOKING_STATUS.CONFIRMED)).toThrow(/Cannot change/);
  });

  it('blocks cancelled bookings from becoming active again', () => {
    expect(() => assertTransition(BOOKING_STATUS.CANCELLED, BOOKING_STATUS.CONFIRMED)).toThrow();
  });

  it('allows cancellation approval from cancellation_requested', () => {
    expect(() => assertTransition(BOOKING_STATUS.CANCELLATION_REQUESTED, BOOKING_STATUS.CANCELLED)).not.toThrow();
  });
});
