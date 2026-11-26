import { describe, expect, it } from '@jest/globals';
import request from 'supertest';
import { app } from '../../src/app.js';

describe('API smoke tests', () => {
  it('exposes service metadata', async () => {
    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('exposes liveness and readiness', async () => {
    const live = await request(app).get('/health/live');
    const ready = await request(app).get('/health/ready');
    expect(live.status).toBe(200);
    expect(ready.status).toBe(200);
  });

  it('validates registration payloads before touching the database', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register/customer')
      .send({ fullName: 'A', email: 'not-an-email', password: 'short', roles: ['admin'] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns a consistent 404 for unknown routes', async () => {
    const response = await request(app).get('/api/v1/does-not-exist');
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('NOT_FOUND');
  });

  it('requires authentication for protected routes', async () => {
    const response = await request(app).get('/api/v1/users/me');
    expect(response.status).toBe(401);
  });
});
