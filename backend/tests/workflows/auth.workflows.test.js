import { beforeAll, beforeEach, afterEach, afterAll, describe, expect, it } from '@jest/globals';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import { app } from '../../src/app.js';
import { User } from '../../src/modules/users/user.model.js';
import { Session } from '../../src/modules/auth/auth.model.js';
import {
  authHeader,
  clearWorkflowCollections,
  connectForWorkflows,
  describeWithDb,
  disconnectForWorkflows,
  expectError,
  expectOk,
  loginUser,
  passwordFor,
  registerUser,
  uniqueEmail
} from './helpers.js';

describeWithDb('DB-backed auth workflows', () => {
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

  it('registers customers and owners with exactly one safe role and rejects escalation', async () => {
    if (!connected) return;

    const customer = await registerUser(app, 'customer');
    const owner = await registerUser(app, 'owner');

    expect(customer.data.user.roles).toEqual(['customer']);
    expect(owner.data.user.roles).toEqual(['owner']);
    expect(customer.data.user.email).toBe(customer.email);
    expect(customer.data.tokens.accessToken).toBeTruthy();
    expect(customer.data.tokens.refreshToken).toBeTruthy();

    const stored = await Promise.all([
      User.findById(customer.data.user.id),
      User.findById(owner.data.user.id)
    ]);
    expect(stored.map((user) => user.roles)).toEqual([['customer'], ['owner']]);

    const escalatedRegistration = await request(app)
      .post('/api/v1/auth/register/customer')
      .send({
        fullName: 'Escalating Customer',
        email: uniqueEmail('escalation'),
        password: passwordFor(),
        roles: ['admin']
      });
    expectError(escalatedRegistration, 400, 'VALIDATION_ERROR');

    const multipleRoles = await request(app)
      .post('/api/v1/auth/register/owner')
      .send({
        fullName: 'Multi Role Owner',
        email: uniqueEmail('multi-role'),
        password: passwordFor(),
        roles: ['owner', 'customer']
      });
    expectError(multipleRoles, 400, 'VALIDATION_ERROR');

    const escalatedProfile = await request(app)
      .patch('/api/v1/users/me')
      .set('Authorization', authHeader(customer.data.tokens.accessToken))
      .send({ roles: ['admin'] });
    expectError(escalatedProfile, 400, 'VALIDATION_ERROR');

    const unchanged = await User.findById(customer.data.user.id);
    expect(unchanged.roles).toEqual(['customer']);
  });

  it('logs in each role and serves /auth/me and /users/me', async () => {
    if (!connected) return;

    for (const role of ['customer', 'owner']) {
      const registered = await registerUser(app, role);
      const tokens = await loginUser(app, registered.email);

      const authMe = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', authHeader(tokens.accessToken));
      const authData = expectOk(authMe);
      expect(authData.user.email).toBe(registered.email);
      expect(authData.user.roles).toEqual([role]);
      expect(authData.permissions).toContain('user.read.own');

      const usersMe = await request(app)
        .get('/api/v1/users/me')
        .set('Authorization', authHeader(tokens.accessToken));
      expect(expectOk(usersMe).user.id).toBe(registered.data.user.id);
    }
  });

  it('rotates refresh tokens and rejects reuse of the consumed token', async () => {
    if (!connected) return;

    const registered = await registerUser(app, 'customer');
    const original = await loginUser(app, registered.email);
    const rotated = expectOk(await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: original.refreshToken }));

    expect(rotated.refreshToken).not.toBe(original.refreshToken);
    expect(rotated.accessToken).not.toBe(original.accessToken);
    expect(jwt.decode(rotated.accessToken).sid).not.toBe(jwt.decode(original.accessToken).sid);

    // Rotation revokes the consumed session; the old access token can no longer authenticate.
    const consumedSession = await Session.findById(jwt.decode(original.accessToken).sid);
    expect(consumedSession.revokedAt).toBeTruthy();

    const staleAccessToken = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader(original.accessToken));
    expectError(staleAccessToken, 401, 'UNAUTHENTICATED');

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', authHeader(rotated.accessToken));
    expect(expectOk(me).user.email).toBe(registered.email);
  });

  it('enforces authentication and role boundaries on protected routes', async () => {
    if (!connected) return;

    const customer = await registerUser(app, 'customer');
    const owner = await registerUser(app, 'owner');

    const anonymous = await request(app).get('/api/v1/users/me');
    expectError(anonymous, 401, 'UNAUTHENTICATED');

    const customerCreatesProperty = await request(app)
      .post('/api/v1/properties')
      .set('Authorization', authHeader(customer.data.tokens.accessToken))
      .send({});
    expectError(customerCreatesProperty, 403, 'FORBIDDEN');

    const ownerUsesAdminRoute = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', authHeader(owner.data.tokens.accessToken));
    expectError(ownerUsesAdminRoute, 403, 'FORBIDDEN');

    const customerUsesOwnerBookingList = await request(app)
      .get('/api/v1/bookings/owner')
      .set('Authorization', authHeader(customer.data.tokens.accessToken));
    expectError(customerUsesOwnerBookingList, 403, 'FORBIDDEN');
  });
});
