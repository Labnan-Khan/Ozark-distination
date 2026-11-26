import { randomUUID } from 'node:crypto';
import { describe, jest } from '@jest/globals';
import mongoose from 'mongoose';
import request from 'supertest';

import { User } from '../../src/modules/users/user.model.js';
import { DeletionRequest } from '../../src/modules/users/deletionRequest.model.js';
import { Session } from '../../src/modules/auth/auth.model.js';
import { Property } from '../../src/modules/properties/property.model.js';
import { PropertyLifecycleRequest } from '../../src/modules/properties/propertyLifecycleRequest.model.js';
import { PropertyCategory } from '../../src/modules/categories/propertyCategory.model.js';
import { ApprovalHistory } from '../../src/modules/properties/approvalHistory.model.js';
import { ChangeRequest } from '../../src/modules/properties/changeRequest.model.js';
import { DuplicateFlag } from '../../src/modules/properties/duplicateFlag.model.js';
import { Booking } from '../../src/modules/bookings/booking.model.js';
import { BookingHistory } from '../../src/modules/bookings/bookingHistory.model.js';
import { AvailabilityReservation } from '../../src/modules/bookings/reservation.model.js';
import { EventOutbox } from '../../src/infrastructure/events/outbox.model.js';
import { AuditLog } from '../../src/modules/auditLogs/auditLog.model.js';
import { Notification } from '../../src/modules/notifications/notification.model.js';

const DEFAULT_TEST_URI = 'mongodb://127.0.0.1:27017/property_rental_test';
export const MONGO_URI = process.env.MONGODB_URI || DEFAULT_TEST_URI;
const SELECTION_TIMEOUT_MS = 3000;

// Remote test MongoDB instances and bcrypt rounds make a single journey slower than Jest's default.
jest.setTimeout(90000);

export const runId = randomUUID().slice(0, 8);

/** Probe the configured test database once so suites skip cleanly without MongoDB. */
async function canReachMongo() {
  let connection;
  try {
    connection = await mongoose.createConnection(MONGO_URI, {
      serverSelectionTimeoutMS: SELECTION_TIMEOUT_MS,
      maxPoolSize: 1,
      minPoolSize: 0
    }).asPromise();
    return true;
  } catch {
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

const reachable = await canReachMongo();
export const describeWithDb = reachable ? describe : describe.skip;

export async function connectForWorkflows() {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: SELECTION_TIMEOUT_MS,
      maxPoolSize: 5,
      minPoolSize: 0
    });
    return true;
  } catch {
    return false;
  }
}

export async function disconnectForWorkflows() {
  if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
}

/** Only collections created by these workflow suites are cleared. */
const workflowModels = [
  User,
  Session,
  DeletionRequest,
  PropertyCategory,
  Property,
  PropertyLifecycleRequest,
  ApprovalHistory,
  ChangeRequest,
  DuplicateFlag,
  Booking,
  BookingHistory,
  AvailabilityReservation,
  EventOutbox,
  AuditLog,
  Notification
];

export async function clearWorkflowCollections() {
  await Promise.all(workflowModels.map((model) => model.deleteMany({})));
}

export const passwordFor = () => 'WorkflowPass123!';
export const uniqueEmail = (label) => `wf-${label}-${runId}-${randomUUID().slice(0, 6)}@example.test`;
export const authHeader = (token) => `Bearer ${token}`;

export function expectOk(response, status = 200) {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(true);
  return response.body.data;
}

export function expectOkWithBody(response, status = 200) {
  if (response.status !== status || !response.body.success) {
    throw new Error(`Expected ${status} success response, got ${response.status}: ${JSON.stringify(response.body)}`);
  }
  return response.body.data;
}

export function expectError(response, status, code) {
  expect(response.status).toBe(status);
  expect(response.body.success).toBe(false);
  expect(response.body.error.code).toBe(code);
  return response.body.error;
}

export async function registerUser(app, role, overrides = {}) {
  const email = overrides.email || uniqueEmail(role);
  const payload = {
    fullName: overrides.fullName || `Workflow ${role}`,
    email,
    password: overrides.password || passwordFor(),
    phone: overrides.phone || '+1234567890'
  };
  const response = await request(app)
    .post(`/api/v1/auth/register/${role}`)
    .send(payload);
  return { data: expectOk(response, 201), email, password: payload.password };
}

export async function loginUser(app, email, password = passwordFor()) {
  const response = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });
  return expectOk(response).tokens;
}

/**
 * Admin credentials are seeded directly (never via a public endpoint), then the
 * normal login endpoint issues a real session/JWT for authenticated admin calls.
 */
export async function createAdmin(app) {
  const { default: bcrypt } = await import('bcryptjs');
  const email = uniqueEmail('admin');
  const password = passwordFor();
  const admin = await User.create({
    roles: ['admin'],
    fullName: 'Workflow Admin',
    email,
    passwordHash: await bcrypt.hash(password, 10),
    phone: '+1234567890',
    accountStatus: 'active'
  });
  const tokens = await loginUser(app, email, password);
  return { admin, email, password, tokens };
}

export async function createCategory(adminId) {
  return PropertyCategory.create({
    code: `wf-flat-${runId}-${randomUUID().slice(0, 5)}`,
    name: `Workflow Flat ${runId}`,
    group: 'residential',
    allowedRentalPeriods: ['daily', 'weekly'],
    attributeSchema: [],
    createdBy: adminId,
    isActive: true
  });
}

export function dateFromToday(days) {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

export function propertyPayload({ categoryId, mode = 'instant', title = `Workflow Studio ${runId}` }) {
  return {
    title,
    description: 'A property created by the workflow integration tests.',
    categoryId: String(categoryId),
    address: {
      country: 'Pakistan',
      stateProvince: 'Sindh',
      city: 'Karachi',
      area: 'DHA',
      street: 'Workflow Street 12',
      unitNumber: 'A-1'
    },
    location: { type: 'Point', coordinates: [67.0011, 24.8607] },
    attributes: [],
    amenities: [],
    pricing: {
      currency: 'PKR',
      defaultPeriod: 'daily',
      rates: [{ period: 'daily', amountMinor: 150000 }, { period: 'weekly', amountMinor: 900000 }],
      requiresDeposit: false,
      depositMinor: null,
      additionalCharges: [],
      taxConfig: null
    },
    rentalPeriods: ['daily', 'weekly'],
    bookingConfig: {
      mode,
      minUnits: 1,
      maxUnits: 60,
      requireGuestCount: false,
      maxGuests: null,
      sameDayCheckInAllowed: false,
      cancellationPolicyId: null,
      autoExpireMinutes: null,
      bookingWindowDays: 365
    },
    availability: {
      isOpenForBooking: true,
      leadTimeDays: 0,
      maxAdvanceDays: 365,
      note: null
    }
  };
}

export async function createPublishedProperty(app, { ownerToken, adminToken, adminId, mode = 'instant' }) {
  const category = await createCategory(adminId);
  const title = `Workflow ${mode} villa ${runId}-${randomUUID().slice(0, 5)}`;

  const created = await request(app)
    .post('/api/v1/properties')
    .set('Authorization', authHeader(ownerToken))
    .send(propertyPayload({ categoryId: category._id, mode, title }));
  const rawProperty = expectOk(created, 201).property;
  const property = { ...rawProperty, id: rawProperty._id || rawProperty.id };

  const approved = await request(app)
    .post(`/api/v1/admin/properties/${property.id}/approve`)
    .set('Authorization', authHeader(adminToken))
    .send({ note: 'workflow approval' });
  expectOk(approved).property;

  const published = await request(app)
    .post(`/api/v1/properties/${property.id}/publish`)
    .set('Authorization', authHeader(ownerToken))
    .send();
  expectOk(published).property;

  return { category, property };
}

export function bookingPayload({ propertyId, checkIn, checkOut }) {
  return { propertyId: String(propertyId), checkIn, checkOut, rentalPeriod: 'daily', guests: 2 };
}
