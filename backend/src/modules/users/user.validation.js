import { z } from 'zod';
import { phoneSchema } from '../../shared/validators/index.js';

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).max(100).optional(),
  phone: phoneSchema,
  preferences: z.record(z.any()).optional()
}).strict();

export const deletionRequestSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable()
}).strict();
