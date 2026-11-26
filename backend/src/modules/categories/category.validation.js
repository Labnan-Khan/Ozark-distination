import { z } from 'zod';
import { ATTRIBUTE_TYPES, CATEGORY_GROUPS, RENTAL_PERIODS } from '../../shared/constants/index.js';
import { objectIdSchema, paginationSchema, rentalPeriodSchema } from '../../shared/validators/index.js';
import { CATEGORY_ATTRIBUTE_TYPES, CATEGORY_SORT_OPTIONS } from './category.constants.js';

const slugSchema = z.string().trim().toLowerCase()
  .min(2)
  .max(60)
  .regex(/^[a-z0-9]+(?:[_-][a-z0-9]+)*$/, 'Use lowercase letters, numbers, "_" or "-", separated by single separators');

const nullableText = (max = 2000) => z.string().trim().max(max).nullable().optional();

/** Query booleans arrive as strings; Boolean('false') would be wrong. */
export const queryBooleanSchema = z.union([
  z.boolean(),
  z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1')
]);

export const attributeDefinitionSchema = z.object({
  key: slugSchema,
  label: z.string().trim().min(1).max(120),
  dataType: z.enum(CATEGORY_ATTRIBUTE_TYPES),
  required: z.boolean().default(false),
  unit: z.string().trim().max(30).nullable().default(null),
  options: z.array(z.object({
    value: z.string().trim().min(1),
    label: z.string().trim().min(1)
  }).strict()).default([]),
  min: z.number().nullable().default(null),
  max: z.number().nullable().default(null),
  minLength: z.number().int().min(0).nullable().default(null),
  maxLength: z.number().int().min(0).nullable().default(null),
  pattern: z.string().max(500).nullable().default(null),
  defaultValue: z.any().nullable().default(null),
  searchable: z.boolean().default(false),
  filterable: z.boolean().default(false),
  displayOrder: z.number().int().default(0),
  deprecated: z.boolean().default(false),
  description: nullableText(500)
}).strict().superRefine((definition, ctx) => {
  if (
    (definition.dataType === ATTRIBUTE_TYPES.ENUM || definition.dataType === ATTRIBUTE_TYPES.MULTI_ENUM) &&
    definition.options.length === 0
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'At least one option is required for enum attributes'
    });
  }
  if (definition.min != null && definition.max != null && definition.min > definition.max) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['min'], message: 'min cannot exceed max' });
  }
  if (definition.minLength != null && definition.maxLength != null && definition.minLength > definition.maxLength) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minLength'], message: 'minLength cannot exceed maxLength' });
  }
  if (definition.pattern) {
    try {
      new RegExp(definition.pattern);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pattern'], message: 'Invalid regular expression' });
    }
  }
});

function refineCategory(value, ctx) {
  if (value.allowedRentalPeriods) {
    const periods = new Set(value.allowedRentalPeriods);
    if (periods.size !== value.allowedRentalPeriods.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['allowedRentalPeriods'], message: 'Duplicate rental periods' });
    }
  }
  if (value.attributeSchema) {
    const keys = new Set(value.attributeSchema.map((definition) => definition.key));
    if (keys.size !== value.attributeSchema.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['attributeSchema'], message: 'Duplicate attribute keys' });
    }
  }
}

export const createCategorySchema = z.object({
  code: slugSchema,
  name: z.string().trim().min(1).max(120),
  group: z.enum(Object.values(CATEGORY_GROUPS)),
  parentId: objectIdSchema.nullable().optional(),
  description: nullableText(),
  icon: nullableText(200),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
  allowedRentalPeriods: z.array(rentalPeriodSchema).min(1).default([RENTAL_PERIODS.MONTHLY]),
  attributeSchema: z.array(attributeDefinitionSchema).default([])
}).strict().superRefine(refineCategory);

export const updateCategorySchema = z.object({
  code: slugSchema.optional(),
  name: z.string().trim().min(1).max(120).optional(),
  group: z.enum(Object.values(CATEGORY_GROUPS)).optional(),
  parentId: objectIdSchema.nullable().optional(),
  description: nullableText(),
  icon: nullableText(200),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  allowedRentalPeriods: z.array(rentalPeriodSchema).min(1).optional(),
  attributeSchema: z.array(attributeDefinitionSchema).optional()
}).strict().superRefine(refineCategory);

export const categoryQuerySchema = paginationSchema.extend({
  group: z.enum(Object.values(CATEGORY_GROUPS)).optional(),
  parentId: objectIdSchema.optional(),
  includeInactive: queryBooleanSchema.optional(),
  sort: z.enum(CATEGORY_SORT_OPTIONS).optional().default('sortOrder')
});

export const categoryIdParamSchema = z.object({ id: objectIdSchema });

/** Accepts both `{ key, value }` entries and already structured AttributeValue slots. */
export const attributeInputSchema = z.object({ key: slugSchema }).passthrough();

export const attributesInputSchema = z.array(attributeInputSchema);
