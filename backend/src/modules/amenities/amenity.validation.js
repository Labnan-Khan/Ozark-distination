import { z } from 'zod';
import { objectIdSchema, paginationSchema } from '../../shared/validators/index.js';

const codeSchema = z.string().trim().toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, 'Use lowercase letters, numbers, "_" or "-", separated by single separators');

const nullableText = (max = 2000) => z.string().trim().max(max).nullable().optional();

/** Query booleans arrive as strings; Boolean('false') would be wrong. */
export const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1')
]);

export const createAmenitySchema = z.object({
  code: codeSchema,
  name: z.string().trim().min(1).max(120),
  description: nullableText(),
  icon: nullableText(200),
  categoryIds: z.array(objectIdSchema).default([]),
  sortOrder: z.number().int().default(0)
}).strict();

export const updateAmenitySchema = z.object({
  code: codeSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  description: nullableText(),
  icon: nullableText(200),
  categoryIds: z.array(objectIdSchema).optional(),
  sortOrder: z.number().int().optional()
}).strict();

export const amenityQuerySchema = paginationSchema.extend({
  categoryId: objectIdSchema.optional(),
  includeInactive: queryBooleanSchema.optional()
});

export const amenityIdParamSchema = z.object({ id: objectIdSchema });

export const amenityIdsSchema = z.array(objectIdSchema);
