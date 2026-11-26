import { z } from 'zod';
import { objectIdSchema, paginationSchema } from '../../shared/validators/index.js';

export const mediaIdParamSchema = z.object({
  mediaId: objectIdSchema
}).strict();

export const propertyIdParamSchema = z.object({
  propertyId: objectIdSchema,
  mediaId: objectIdSchema.optional()
}).strict();

export const updateMediaSchema = z.object({
  isCover: z.boolean().optional(),
  displayOrder: z.number().int().nonnegative().optional(),
  alt: z.string().trim().max(300).optional().nullable()
}).strict().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field is required'
);

export const mediaListQuerySchema = paginationSchema.extend({
  resourceType: z.string().optional()
});
