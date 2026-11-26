import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app.js';

const expectError = (response, status, code) => {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe(code);
  expect(response.body.error.requestId).toBeTruthy();
};

describe('public API contract', () => {
  it('returns the success envelope for service metadata', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, data: { service: 'property-rental-api', version: 'v1' } });
  });

  it('rejects role escalation attempts during customer registration', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register/customer')
      .send({
        fullName: 'Test Customer',
        email: 'customer@example.com',
        password: 'StrongPassword123!',
        roles: ['admin']
      });
    expectError(response, 400, 'VALIDATION_ERROR');
  });

  it('rejects malformed object IDs on public category lookup', async () => {
    const response = await request(app).get('/api/v1/categories/not-an-object-id');
    expectError(response, 400, 'VALIDATION_ERROR');
  });

  it('requires a map viewport', async () => {
    const response = await request(app).get('/api/v1/search/map');
    expectError(response, 400, 'VALIDATION_ERROR');
  });

  it('requires complete lat/lng/radiusKm map viewports', async () => {
    const response = await request(app).get('/api/v1/search/map?lat=24.7136&lng=46.6753');
    expectError(response, 400, 'VALIDATION_ERROR');
  });

  it('rejects bbox combined with lat/lng/radiusKm', async () => {
    const response = await request(app).get('/api/v1/search/map?bbox=46.5,24.5,46.8,24.9&lat=24.7136&lng=46.6753&radiusKm=5');
    expectError(response, 400, 'VALIDATION_ERROR');
  });

  it('protects admin routes from anonymous callers', async () => {
    const response = await request(app).get('/api/v1/admin/users');
    expectError(response, 401, 'UNAUTHENTICATED');
  });
});
