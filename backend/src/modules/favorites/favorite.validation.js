import { z } from 'zod';
import { objectIdSchema, paginationSchema } from '../../shared/validators/index.js';

export const addFavoriteSchema = z.object({
  propertyId: objectIdSchema
}).strict();

export const favoritePropertyParamSchema = z.object({
  propertyId: objectIdSchema
});

export const favoriteQuerySchema = paginationSchema;
