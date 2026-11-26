import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from '@jest/globals';
import { randomUUID } from 'node:crypto';
import request from 'supertest';

import { app } from '../../src/app.js';
import { Property } from '../../src/modules/properties/property.model.js';
import {
  authHeader,
  clearWorkflowCollections,
  connectForWorkflows,
  createAdmin,
  createCategory,
  describeWithDb,
  disconnectForWorkflows,
  expectError,
  expectOk,
  propertyPayload,
  registerUser
} from './helpers.js';

describeWithDb('DB-backed property approval and publishing workflow', () => {
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

  it('takes a listing from owner draft through admin approval to public search visibility', async () => {
    if (!connected) return;

    const { admin, tokens: adminTokens } = await createAdmin(app);
    const owner = await registerUser(app, 'owner');
    const customer = await registerUser(app, 'customer');
    const category = await createCategory(admin._id);
    const searchToken = `workflowsearch${randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const title = `Seaside ${searchToken} apartment`;

    const created = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send(propertyPayload({ categoryId: category._id, title }));
    const rawProperty = expectOk(created, 201).property;
    const property = { ...rawProperty, id: rawProperty._id || rawProperty.id };
    expect(property.listingStatus).toBe('draft');
    expect(property.approvalStatus).toBe('pending');
    expect(String(property.ownerId)).toBe(owner.data.user.id);

    const storedDraft = await Property.findById(property.id);
    expect(storedDraft.listingStatus).toBe('draft');
    expect(storedDraft.approvalStatus).toBe('pending');

    const hiddenBeforeApproval = await request(app).get(`/api/v1/properties/${property.id}`);
    expectError(hiddenBeforeApproval, 404, 'NOT_FOUND');

    const searchBeforeApproval = await request(app)
      .get('/api/v1/search/properties')
      .query({ q: searchToken, limit: 50 });
    expect(expectOk(searchBeforeApproval).items).toHaveLength(0);

    const approved = await request(app)
      .post(`/api/v1/admin/properties/${property.id}/approve`)
      .set('Authorization', authHeader(adminTokens.accessToken))
      .send({ note: 'Meets workflow requirements' });
    const approvedProperty = expectOk(approved).property;
    expect(approvedProperty.approvalStatus).toBe('approved');
    expect(approvedProperty.listingStatus).toBe('draft');

    const hiddenBeforePublish = await request(app).get(`/api/v1/properties/${property.id}`);
    expectError(hiddenBeforePublish, 404, 'NOT_FOUND');

    const published = await request(app)
      .post(`/api/v1/properties/${property.id}/publish`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send();
    const publishedProperty = expectOk(published).property;
    expect(publishedProperty.listingStatus).toBe('published');
    expect(publishedProperty.approvalStatus).toBe('approved');

    const detail = await request(app).get(`/api/v1/properties/${property.id}`);
    const publicDetail = expectOk(detail);
    expect(publicDetail.property._id || publicDetail.property.id).toBe(property.id);
    expect(publicDetail.property.title).toBe(title);
    expect(publicDetail.property.listingStatus).toBe('published');
    expect(publicDetail.property.approvalStatus).toBe('approved');

    const authenticatedDetail = await request(app)
      .get(`/api/v1/properties/${property.id}`)
      .set('Authorization', authHeader(customer.data.tokens.accessToken));
    const authenticatedProperty = expectOk(authenticatedDetail).property;
    expect(authenticatedProperty._id || authenticatedProperty.id).toBe(property.id);

    const search = await request(app)
      .get('/api/v1/search/properties')
      .query({ q: searchToken, limit: 50, city: 'Karachi' });
    const items = expectOk(search).items;
    expect(items.map((item) => item.id)).toContain(property.id);
    expect(items.find((item) => item.id === property.id).ownerId).toBeUndefined();
  });

  it('blocks publishing until an administrator approves the listing', async () => {
    if (!connected) return;

    const { admin, tokens: adminTokens } = await createAdmin(app);
    const owner = await registerUser(app, 'owner');
    const category = await createCategory(admin._id);

    const created = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send(propertyPayload({ categoryId: category._id }));
    const rawProperty = expectOk(created, 201).property;
    const property = { ...rawProperty, id: rawProperty._id || rawProperty.id };

    const prematurePublish = await request(app)
      .post(`/api/v1/properties/${property.id}/publish`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send();
    expectError(prematurePublish, 409, 'NOT_APPROVED');

    const customerAttemptsApproval = await request(app)
      .post(`/api/v1/admin/properties/${property.id}/approve`)
      .set('Authorization', authHeader(owner.data.tokens.accessToken))
      .send({});
    expectError(customerAttemptsApproval, 403, 'FORBIDDEN');

    expect((await Property.findById(property.id)).listingStatus).toBe('draft');
    const adminDetail = expectOk(await request(app)
      .get(`/api/v1/admin/properties/${property.id}`)
      .set('Authorization', authHeader(adminTokens.accessToken))).property;
    expect(adminDetail._id || adminDetail.id).toBe(property.id);
  });
});
