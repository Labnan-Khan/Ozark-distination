import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from '@jest/globals';
import request from 'supertest';

import { app } from '../../src/app.js';
import { Property } from '../../src/modules/properties/property.model.js';
import { PropertyLifecycleRequest } from '../../src/modules/properties/propertyLifecycleRequest.model.js';
import {
  authHeader,
  bookingPayload,
  clearWorkflowCollections,
  connectForWorkflows,
  createAdmin,
  createCategory,
  createPublishedProperty,
  dateFromToday,
  describeWithDb,
  disconnectForWorkflows,
  expectError,
  expectOk,
  propertyPayload,
  registerUser
} from './helpers.js';

describeWithDb('DB-backed property lifecycle workflows', () => {
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

  it('soft-deletes a clean property and blocks deletion when history exists', async () => {
    if (!connected) return;

    const { admin, tokens: adminTokens } = await createAdmin(app);
    const owner = await registerUser(app, 'owner');
    const category = await createCategory(admin._id);

    const created = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send(propertyPayload({ categoryId: category._id, title: 'Lifecycle deletion studio' }));
    const rawProperty = expectOk(created, 201).property;
    const propertyId = rawProperty._id || rawProperty.id;

    const deleted = await request(app)
      .delete(`/api/v1/admin/properties/${propertyId}`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ reason: 'Policy violation' });
    expect(expectOk(deleted).property.deletedAt).toBeTruthy();

    const stored = await Property.findById(propertyId);
    expect(stored.deletedAt).toBeTruthy();
    expect(stored.listingStatus).toBe('archived');

    const publicDetail = await request(app).get(`/api/v1/properties/${propertyId}`);
    expectError(publicDetail, 404, 'NOT_FOUND');

    const { property: historicProperty } = await createPublishedProperty(app, {
      ownerToken: owner.data.tokens.accessToken,
      adminToken: adminTokens.accessToken,
      adminId: admin._id,
      mode: 'instant'
    });
    const blocked = await request(app)
      .delete(`/api/v1/admin/properties/${historicProperty.id}`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ reason: 'Policy violation' });
    expectError(blocked, 409, 'PROPERTY_HAS_HISTORY');
  });

  it('creates, rejects and lists an owner delete request', async () => {
    if (!connected) return;

    const { admin, tokens: adminTokens } = await createAdmin(app);
    const owner = await registerUser(app, 'owner');
    const category = await createCategory(admin._id);
    const created = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send(propertyPayload({ categoryId: category._id, title: 'Delete request studio' }));
    const rawProperty = expectOk(created, 201).property;
    const propertyId = rawProperty._id || rawProperty.id;

    const requestDelete = await request(app)
      .post(`/api/v1/properties/${propertyId}/delete-request`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send({ reason: 'Owner no longer lists this property' });
    const lifecycleRequest = expectOk(requestDelete, 202).request;
    expect(lifecycleRequest.action).toBe('delete');
    expect(lifecycleRequest.status).toBe('pending');

    const duplicate = await request(app)
      .post(`/api/v1/properties/${propertyId}/delete-request`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send({ reason: 'Duplicate request' });
    expectError(duplicate, 409, 'LIFECYCLE_REQUEST_PENDING');

    const rejected = await request(app)
      .post(`/api/v1/admin/properties/lifecycle-requests/${lifecycleRequest._id}/reject`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ reason: 'Reservation schedule still active' });
    expect(expectOk(rejected).request.status).toBe('rejected');
    expect((await Property.findById(propertyId)).deletedAt).toBeFalsy();

    const mine = await request(app)
      .get('/api/v1/properties/me/lifecycle-requests')
      .set('Authorization', authHeader(owner.data.tokens.accessToken));
    expect(expectOk(mine).requests.map((item) => item._id)).toContain(lifecycleRequest._id);

    const adminList = await request(app)
      .get('/api/v1/admin/properties/lifecycle-requests')
      .set('Authorization', authHeader(adminTokens.accessToken));
    expect(expectOk(adminList).requests.map((item) => item._id)).toContain(lifecycleRequest._id);
    expect(await PropertyLifecycleRequest.countDocuments({ propertyId })).toBe(1);
  });

  it('creates an archive request for a booked property and applies it on admin approval', async () => {
    if (!connected) return;

    const { admin, tokens: adminTokens } = await createAdmin(app);
    const owner = await registerUser(app, 'owner');
    const customer = await registerUser(app, 'customer');
    const { property } = await createPublishedProperty(app, {
      ownerToken: owner.data.tokens.accessToken,
      adminToken: adminTokens.accessToken,
      adminId: admin._id,
      mode: 'instant'
    });

    const booked = await request(app)
      .post('/api/v1/bookings')
      .set('Authorization', authHeader(customer.data.tokens.accessToken))
      .send(bookingPayload({
        propertyId: property.id,
        checkIn: dateFromToday(3),
        checkOut: dateFromToday(5)
      }));
    expectOk(booked, 201);

    const archive = await request(app)
      .post(`/api/v1/properties/${property.id}/archive`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send({ reason: 'Renovation after current stay' });
    const lifecycleRequest = expectOk(archive, 202).request;
    expect(lifecycleRequest.action).toBe('archive');
    expect(lifecycleRequest.status).toBe('pending');

    expect((await Property.findById(property.id)).listingStatus).toBe('published');

    const approved = await request(app)
      .post(`/api/v1/admin/properties/lifecycle-requests/${lifecycleRequest._id}/approve`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ note: 'Approved after booking review' });
    const result = expectOk(approved);
    expect(result.request.status).toBe('approved');
    expect(result.property.listingStatus).toBe('archived');

    const storedRequest = await PropertyLifecycleRequest.findById(lifecycleRequest._id);
    expect(storedRequest.status).toBe('approved');
    expect(storedRequest.reviewedAt).toBeTruthy();
  });
});
