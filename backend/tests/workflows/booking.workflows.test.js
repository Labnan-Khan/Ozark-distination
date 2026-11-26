import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';

import { app } from '../../src/app.js';
import { AvailabilityReservation } from '../../src/modules/bookings/reservation.model.js';
import { Booking } from '../../src/modules/bookings/booking.model.js';
import {
  authHeader,
  bookingPayload,
  clearWorkflowCollections,
  connectForWorkflows,
  createAdmin,
  createPublishedProperty,
  dateFromToday,
  describeWithDb,
  disconnectForWorkflows,
  expectError,
  expectOk,
  expectOkWithBody,
  registerUser
} from './helpers.js';

describeWithDb('DB-backed booking workflows', () => {
  let connected = false;

  beforeAll(async () => {
    connected = await connectForWorkflows();
  });

  beforeEach(async () => {
    if (connected) await clearWorkflowCollections();
  });

  afterEach(async () => {
    if (connected) await clearWorkflowCollections();
  });

  afterAll(async () => {
    await disconnectForWorkflows();
  });

  it('confirms instant bookings, reserves dates and rejects overlapping bookings with 409', async () => {
    if (!connected) return;

    const { admin, tokens: adminTokens } = await createAdmin(app);
    const owner = await registerUser(app, 'owner');
    const customer = await registerUser(app, 'customer');
    const rival = await registerUser(app, 'customer');
    const { property } = await createPublishedProperty(app, {
      ownerToken: owner.data.tokens.accessToken,
      adminToken: adminTokens.accessToken,
      adminId: admin._id,
      mode: 'instant'
    });

    const checkIn = dateFromToday(3);
    const checkOut = dateFromToday(5);
    const created = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', authHeader(customer.data.tokens.accessToken))
      .send(bookingPayload({ propertyId: property.id, checkIn, checkOut }));
    const rawBooking = expectOkWithBody(created, 201).booking;
    const booking = { ...rawBooking, id: rawBooking._id || rawBooking.id };
    expect(booking.status).toBe('confirmed');
    expect(booking.reference).toBeTruthy();

    const reservations = await AvailabilityReservation.find({ bookingId: booking.id }).sort({ date: 1 });
    expect(reservations).toHaveLength(2);
    expect(reservations.map((reservation) => reservation.date.toISOString().slice(0, 10)))
      .toEqual([checkIn, dateFromToday(4)]);

    const conflict = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', authHeader(rival.data.tokens.accessToken))
      .send(bookingPayload({
        propertyId: property.id,
        checkIn: dateFromToday(4),
        checkOut: dateFromToday(6)
      }));
    expectError(conflict, 409, 'BOOKING_DATE_CONFLICT');

    const conflictingAvailability = await request(app)
      .get(`/api/v1/properties/${property.id}/availability`)
      .query({ checkIn: dateFromToday(4), checkOut: dateFromToday(6) });
    expect(expectOk(conflictingAvailability)).toMatchObject({ available: false, reason: 'DATE_CONFLICT' });

    const freeAvailability = await request(app)
      .get(`/api/v1/properties/${property.id}/availability`)
      .query({ checkIn: dateFromToday(6), checkOut: dateFromToday(8) });
    expect(expectOk(freeAvailability).available).toBe(true);

    const nonOverlapping = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', authHeader(rival.data.tokens.accessToken))
      .send(bookingPayload({
        propertyId: property.id,
        checkIn: dateFromToday(6),
        checkOut: dateFromToday(8)
      }));
    expect(expectOk(nonOverlapping, 201).booking.status).toBe('confirmed');

    const ownerList = await request(app)
      .get('/api/v1/bookings/owner')
      .set('Authorization', authHeader(owner.data.tokens.accessToken));
    expect(expectOk(ownerList).bookings.map((item) => item._id || item.id)).toContain(booking.id);
    expect(await Booking.countDocuments({ propertyId: property.id })).toBe(2);
  });

  it('keeps request bookings pending until owner approval and releases reservations on cancellation', async () => {
    if (!connected) return;

    const { admin, tokens: adminTokens } = await createAdmin(app);
    const owner = await registerUser(app, 'owner');
    const customer = await registerUser(app, 'customer');
    const { property } = await createPublishedProperty(app, {
      ownerToken: owner.data.tokens.accessToken,
      adminToken: adminTokens.accessToken,
      adminId: admin._id,
      mode: 'request'
    });

    const checkIn = dateFromToday(3);
    const checkOut = dateFromToday(5);
    const created = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', authHeader(customer.data.tokens.accessToken))
      .send(bookingPayload({ propertyId: property.id, checkIn, checkOut }));
    const rawBooking = expectOkWithBody(created, 201).booking;
    const booking = { ...rawBooking, id: rawBooking._id || rawBooking.id };
    expect(booking.status).toBe('pending');
    expect(await AvailabilityReservation.countDocuments({ bookingId: booking.id })).toBe(0);

    const prematureCancellation = await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancel`)
      .set('Authorization', authHeader(customer.data.tokens.accessToken))
      .send({ reason: 'Customer cannot cancel directly yet' });
    expectError(prematureCancellation, 403, 'FORBIDDEN');

    const approved = await request(app)
      .post(`/api/v1/bookings/${booking.id}/approve`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send({ note: 'Approved by owner' });
    expect(expectOk(approved).booking.status).toBe('confirmed');
    expect(await AvailabilityReservation.countDocuments({ bookingId: booking.id })).toBe(2);

    const conflict = await request(app)
      .get(`/api/v1/properties/${property.id}/availability`)
      .query({ checkIn, checkOut });
    expect(expectOk(conflict)).toMatchObject({ available: false, reason: 'DATE_CONFLICT' });

    const cancelRequest = await request(app)
      .post(`/api/v1/bookings/${booking.id}/cancellation-request`)
      .set('Authorization', authHeader(customer.data.tokens.accessToken))
      .send({ reason: 'Travel plans changed unexpectedly' });
    const requesting = expectOk(cancelRequest, 202).booking;
    expect(requesting.status).toBe('cancellation_requested');
    expect(requesting.cancellation.status).toBe('requested');

    const reviewed = await request(app)
      .post(`/api/v1/bookings/${booking.id}/review-cancellation`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send({ decision: 'approve', note: 'Approved by owner' });
    const cancelled = expectOkWithBody(reviewed).booking;
    expect(cancelled.status).toBe('cancelled');
    expect(cancelled.cancellation.status).toBe('approved');
    expect(await AvailabilityReservation.countDocuments({ bookingId: booking.id })).toBe(0);

    const availableAgain = await request(app)
      .get(`/api/v1/properties/${property.id}/availability`)
      .query({ checkIn, checkOut });
    expect(expectOk(availableAgain).available).toBe(true);

    const stored = await Booking.findById(booking.id);
    expect(stored.status).toBe('cancelled');
  });
});
