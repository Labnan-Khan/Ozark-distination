import mongoose from 'mongoose';
import { z } from 'zod';
import { RENTAL_PERIODS } from '../constants/index.js';

export const objectIdSchema = z.string().refine((value) => mongoose.Types.ObjectId.isValid(value), 'Invalid ObjectId');

export const emailSchema = z.string().trim().toLowerCase().email().max(254);

export const passwordSchema = z.string().min(12).max(128);

export const phoneSchema = z.string().trim().regex(/^\+?[0-9\s-]{7,20}$/).optional().nullable();

export const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD').refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Invalid calendar date');

export const moneyMinorSchema = z.number().int().nonnegative();

export const currencySchema = z.string().length(3).regex(/^[A-Z]{3}$/);

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sort: z.string().optional()
});

export const rentalPeriodSchema = z.enum(Object.values(RENTAL_PERIODS));

export const locationSchema = z.object({
  type: z.literal('Point'),
  coordinates: z.tuple([
    z.number().min(-180).max(180),
    z.number().min(-90).max(90)
  ])
}).optional().nullable();

export function strictObject(shape) {
  return z.object(shape).strict();
}
