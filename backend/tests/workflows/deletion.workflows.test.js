import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';

import { app } from '../../src/app.js';
import { User } from '../../src/modules/users/user.model.js';
import { DeletionRequest } from '../../src/modules/users/deletionRequest.model.js';
import { Booking } from '../../src/modules/bookings/booking.model.js';
import {
  authHeader,
  clearWorkflowCollections,
  connectForWorkflows,
  createAdmin,
  dateFromToday,
  describeWithDb,
  disconnectForWorkflows,
  expectError,
  expectOk,
  loginUser,
  registerUser
} from './helpers.js';

describeWithDb('DB-backed account deletion request workflow', () => {
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

  it('creates a user deletion request, lets an admin approve it and invalidates old sessions', async () => {
    if (!connected) return;

    const { tokens: adminTokens } = await createAdmin(app);
    const customer = await registerUser(app, 'customer');
    const token = customer.data.tokens.accessToken;

    const created = await request(app)
      .post('/api/v1/users/me/deletion-requests')
      .set('Authorization', authHeader(token))
      .send({ reason: 'I no longer need this account' });
    const requestData = expectOk(created, 201).request;
    const requestId = requestData._id || requestData.id;
    expect(requestData.status).toBe('pending');
    expect(requestData.requestedBy).toBe('user');
    expect(requestData.activeBookingCheck.hasActive).toBe(false);

    const mine = await request(app)
      .get('/api/v1/users/me/deletion-requests')
      .set('Authorization', authHeader(token));
    const mineData = expectOk(mine).request;
    expect(mineData._id || mineData.id).toBe(requestId);

    const listed = await request(app)
      .get('/api/v1/admin/deletion-requests')
      .query({ status: 'pending' })
      .set('Authorization', authHeader(adminTokens.accessToken));
    expect(expectOk(listed).requests.map((item) => item._id || item.id)).toContain(requestId);

    const approved = await request(app)
      .post(`/api/v1/admin/deletion-requests/${requestId}/approve`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ note: 'Verified identity' });
    expect(expectOk(approved).request.status).toBe('approved');

    const anonymized = await User.findById(customer.data.user.id).select('+passwordHash');
    expect(anonymized.accountStatus).toBe('deleted');
    expect(anonymized.deletedAt).toBeTruthy();
    expect(anonymized.email).not.toBe(customer.email);

    const revokedToken = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader(token));
    expectError(revokedToken, 401, 'UNAUTHENTICATED');

    const secondReview = await request(app)
      .post(`/api/v1/admin/deletion-requests/${requestId}/approve`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ note: 'Duplicate review' });
    expectError(secondReview, 409, 'INVALID_STATE_TRANSITION');
  });

  it('requires a rejection note, keeps a rejected account active, and blocks requests with active bookings', async () => {
    if (!connected) return;

    const { tokens: adminTokens } = await createAdmin(app);
    const rejectedCustomer = await registerUser(app, 'customer');
    const activeCustomer = await registerUser(app, 'customer');

    const created = await request(app)
      .post('/api/v1/users/me/deletion-requests')
      .set('Authorization', authHeader(rejectedCustomer.data.tokens.accessToken))
      .send({ reason: 'Temporary account' });
    const requestData = expectOk(created, 201).request;
    const requestId = requestData._id || requestData.id;

    const missingNote = await request(app)
      .post(`/api/v1/admin/deletion-requests/${requestId}/reject`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({});
    expectError(missingNote, 400, 'VALIDATION_ERROR');

    const rejected = await request(app)
      .post(`/api/v1/admin/deletion-requests/${requestId}/reject`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ note: 'Active booking found during manual review' });
    expect(expectOk(rejected).request.status).toBe('rejected');

    const stillActive = await User.findById(rejectedCustomer.data.user.id);
    expect(stillActive.accountStatus).toBe('active');
    expect((await loginUser(app, rejectedCustomer.email)).accessToken).toBeTruthy();

    await Booking.create({
      reference: `WF-DEL-${new mongoose.Types.ObjectId()}`,
      customerId: activeCustomer.data.user.id,
      ownerId: rejectedCustomer.data.user.id,
      propertyId: new mongoose.Types.ObjectId(),
      propertySnapshot: { title: 'Workflow booking block' },
      checkInDate: new Date(`${dateFromToday(2)}T00:00:00.000Z`),
      checkOutDate: new Date(`${dateFromToday(4)}T00:00:00.000Z`),
      rentalPeriod: 'daily',
      priceSnapshot: { totalMinor: 1000 },
      bookingModeSnapshot: 'instant',
      status: 'confirmed'
    });

    const blocked = await request(app)
      .post('/api/v1/users/me/deletion-requests')
      .set('Authorization', authHeader(activeCustomer.data.tokens.accessToken))
      .send({ reason: 'Trying to delete with a booking' });
    expectError(blocked, 409, 'ACTIVE_BOOKINGS_EXIST');
    expect(await DeletionRequest.countDocuments({ userId: activeCustomer.data.user.id })).toBe(0);
  });
});
