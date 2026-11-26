import { z } from 'zod';
import {
  dateOnlySchema,
  objectIdSchema,
  paginationSchema,
  rentalPeriodSchema
} from '../../shared/validators/index.js';

export const createBookingSchema = z.object({
  propertyId: objectIdSchema,
  checkIn: dateOnlySchema,
  checkOut: dateOnlySchema,
  rentalPeriod: rentalPeriodSchema,
  guests: z.number().int().positive().max(100).optional().nullable(),
  specialRequests: z.string().trim().max(1000).optional().nullable(),
  customerId: objectIdSchema.optional()
}).strict().refine((input) => input.checkOut > input.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut']
});

export const availabilityQuerySchema = z.object({
  checkIn: dateOnlySchema,
  checkOut: dateOnlySchema,
  guests: z.coerce.number().int().positive().optional()
}).refine((input) => input.checkOut > input.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut']
});

export const bookingListQuerySchema = paginationSchema.extend({
  status: z.string().optional(),
  propertyId: objectIdSchema.optional(),
  customerId: objectIdSchema.optional(),
  ownerId: objectIdSchema.optional(),
  from: z.string().optional(),
  to: z.string().optional()
});

export const reasonSchema = z.object({
  reason: z.string().trim().min(3).max(500)
}).strict();

export const rejectSchema = reasonSchema;

export const reviewCancellationSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(500).optional().nullable()
}).strict();

export const approveSchema = z.object({
  note: z.string().trim().max(500).optional().nullable()
}).strict();

export const modifyDatesSchema = z.object({
  checkIn: dateOnlySchema,
  checkOut: dateOnlySchema
}).strict().refine((input) => input.checkOut > input.checkIn, {
  message: 'checkOut must be after checkIn',
  path: ['checkOut']
});
