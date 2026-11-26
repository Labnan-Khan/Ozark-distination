import { z } from 'zod';
import { dateOnlySchema, objectIdSchema, paginationSchema, rentalPeriodSchema } from '../../shared/validators/index.js';

const attributeValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.union([z.string(), z.number(), z.boolean()]))
]);

const amenityIdsParam = z.union([z.string(), z.array(z.string())])
  .transform((value) => (Array.isArray(value) ? value : value.split(',')).map((id) => id.trim()).filter(Boolean))
  .pipe(z.array(objectIdSchema));

export const searchSortSchema = z.enum(['newest', 'price_asc', 'price_desc']);

export const searchPropertiesQuerySchema = paginationSchema.extend({
  q: z.string().trim().max(200).optional(),
  country: z.string().trim().max(100).optional(),
  stateProvince: z.string().trim().max(100).optional(),
  city: z.string().trim().max(100).optional(),
  area: z.string().trim().max(120).optional(),
  categoryId: objectIdSchema.optional(),
  subcategoryId: objectIdSchema.optional(),
  subcategoryCode: z.string().trim().max(60).optional(),
  minPrice: z.coerce.number().int().min(0).optional(),
  maxPrice: z.coerce.number().int().min(0).optional(),
  period: rentalPeriodSchema.optional(),
  checkIn: dateOnlySchema.optional(),
  checkOut: dateOnlySchema.optional(),
  bedroomsMin: z.coerce.number().int().min(0).optional(),
  bathroomsMin: z.coerce.number().int().min(0).optional(),
  furnishing: z.string().trim().max(60).optional(),
  amenities: amenityIdsParam.optional(),
  attributes: z.record(attributeValueSchema).optional(),
  sort: searchSortSchema.optional().default('newest')
  // Keep flattened keys such as `attributes.bedrooms` for the simple query parser.
}).passthrough();

export const mapSearchQuerySchema = searchPropertiesQuerySchema.extend({
  bbox: z.string().trim().regex(
    /^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?$/,
    'bbox must be minLng,minLat,maxLng,maxLat'
  ).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radiusKm: z.coerce.number().positive().max(20000).optional()
}).superRefine((query, ctx) => {
  const hasBbox = Boolean(query.bbox);
  const hasLat = query.lat !== undefined;
  const hasLng = query.lng !== undefined;
  const hasRadius = query.radiusKm !== undefined;
  const hasCenter = hasLat && hasLng;
  const hasPartialCenter = hasLat || hasLng || hasRadius;

  if (hasBbox && hasPartialCenter) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Use either bbox or lat,lng,radiusKm, not both'
    });
    return;
  }

  if (!hasBbox && !hasCenter) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'bbox or lat,lng,radiusKm is required for map search'
    });
    return;
  }

  if (hasCenter && !hasRadius) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['radiusKm'],
      message: 'radiusKm is required with lat/lng'
    });
  }
});

/** Supports both `attributes[key]=value` and flattened `attributes.key=value` query styles. */
export function normalizeSearchQuery(query = {}) {
  const attributes = { ...(query.attributes || {}) };
  for (const [key, value] of Object.entries(query)) {
    if (key.startsWith('attributes.')) attributes[key.slice('attributes.'.length)] = value;
  }
  return { ...query, attributes };
}
