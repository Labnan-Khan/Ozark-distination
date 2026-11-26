import { z } from 'zod';
import {
  BOOKING_MODES,
  LISTING_STATUS,
  APPROVAL_STATUS,
  RENTAL_PERIODS
} from '../../shared/constants/index.js';
import {
  currencySchema,
  dateOnlySchema,
  locationSchema,
  objectIdSchema,
  paginationSchema,
  rentalPeriodSchema
} from '../../shared/validators/index.js';

const unique = (values) => new Set(values).size === values.length;

const attributeValueSchema = z.object({
  key: z.string().trim().min(1).max(100),
  value: z.union([
    z.string().max(2000),
    z.number(),
    z.boolean(),
    z.array(z.union([z.string(), z.number()])).max(100),
    z.null()
  ])
}).strict();

const addressSchema = z.object({
  country: z.string().trim().min(1).max(100),
  stateProvince: z.string().trim().max(100).nullable().optional(),
  city: z.string().trim().min(1).max(100),
  area: z.string().trim().max(100).nullable().optional(),
  street: z.string().trim().min(1).max(200),
  unitNumber: z.string().trim().max(50).nullable().optional(),
  fullAddress: z.string().trim().max(500).nullable().optional(),
  postalCode: z.string().trim().max(30).nullable().optional()
}).strict();

const rateSchema = z.object({
  period: rentalPeriodSchema,
  amountMinor: z.number().int().positive(),
  label: z.string().trim().max(100).nullable().optional()
}).strict();

const pricingSchema = z.object({
  currency: currencySchema,
  defaultPeriod: rentalPeriodSchema,
  rates: z.array(rateSchema).min(1).max(10),
  requiresDeposit: z.boolean().default(false),
  depositMinor: z.number().int().nonnegative().nullable().default(null),
  additionalCharges: z.array(z.object({}).passthrough()).default([]),
  taxConfig: z.object({}).passthrough().nullable().default(null)
}).strict().superRefine((value, ctx) => {
  const periods = value.rates.map((rate) => rate.period);
  if (!unique(periods)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rates'], message: 'Duplicate rate periods are not allowed' });
  }
});

const bookingConfigSchema = z.object({
  mode: z.enum(Object.values(BOOKING_MODES)),
  minUnits: z.number().int().positive().default(1),
  maxUnits: z.number().int().positive().default(1),
  requireGuestCount: z.boolean().default(false),
  maxGuests: z.number().int().positive().nullable().default(null),
  sameDayCheckInAllowed: z.boolean().default(false),
  cancellationPolicyId: objectIdSchema.nullable().default(null),
  autoExpireMinutes: z.number().int().positive().nullable().default(null),
  bookingWindowDays: z.number().int().positive().default(365)
}).strict();

const availabilityInputSchema = z.object({
  isOpenForBooking: z.boolean().default(true),
  leadTimeDays: z.number().int().min(0).default(0),
  maxAdvanceDays: z.number().int().positive().default(365),
  note: z.string().trim().max(1000).nullable().default(null)
}).strict();

const mediaOrderSchema = z.array(z.object({
  mediaId: objectIdSchema,
  displayOrder: z.number().int().min(0)
}).strict()).max(100);

function validateRentalPeriods(data, ctx) {
  if (!unique(data.rentalPeriods)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rentalPeriods'], message: 'Duplicate rental periods are not allowed' });
  }
  if (!data.rentalPeriods.includes(data.pricing.defaultPeriod)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pricing', 'defaultPeriod'],
      message: 'defaultPeriod must be one of rentalPeriods'
    });
  }
  const ratePeriods = new Set(data.pricing.rates.map((rate) => rate.period));
  for (const period of data.rentalPeriods) {
    if (!ratePeriods.has(period)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pricing', 'rates'],
        message: `A rate is required for ${period}`
      });
    }
  }
  if (data.bookingConfig.minUnits > data.bookingConfig.maxUnits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bookingConfig', 'maxUnits'],
      message: 'maxUnits must be greater than or equal to minUnits'
    });
  }
}

export const createPropertySchema = z.object({
  title: z.string().trim().min(5).max(150),
  description: z.string().trim().min(1).max(10000),
  categoryId: objectIdSchema,
  subcategoryId: objectIdSchema.nullable().optional(),
  ownerId: objectIdSchema.optional(),
  address: addressSchema,
  location: locationSchema,
  attributes: z.array(attributeValueSchema).max(50).default([]),
  amenities: z.array(objectIdSchema).max(100).default([]),
  pricing: pricingSchema,
  rentalPeriods: z.array(rentalPeriodSchema).min(1),
  bookingConfig: bookingConfigSchema,
  availability: availabilityInputSchema.optional()
}).strict().superRefine(validateRentalPeriods);

export const updatePropertySchema = z.object({
  title: z.string().trim().min(5).max(150).optional(),
  description: z.string().trim().min(1).max(10000).optional(),
  address: addressSchema.partial().optional(),
  location: locationSchema,
  attributes: z.array(attributeValueSchema).max(50).optional(),
  amenities: z.array(objectIdSchema).max(100).optional(),
  pricing: pricingSchema.optional(),
  rentalPeriods: z.array(rentalPeriodSchema).min(1).optional(),
  bookingConfig: bookingConfigSchema.partial().optional(),
  availability: availabilityInputSchema.partial().optional(),
  mediaOrder: mediaOrderSchema.optional(),
  reason: z.string().trim().max(1000).optional()
}).strict().superRefine((data, ctx) => {
  if (!Object.keys(data).some((key) => key !== 'reason')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one editable field is required' });
  }
  const periods = data.rentalPeriods;
  const pricing = data.pricing;
  if (periods && !unique(periods)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['rentalPeriods'], message: 'Duplicate rental periods are not allowed' });
  }
  if (pricing && periods && !periods.includes(pricing.defaultPeriod)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pricing', 'defaultPeriod'],
      message: 'defaultPeriod must be one of rentalPeriods'
    });
  }
  if (pricing && periods) {
    const ratePeriods = new Set(pricing.rates.map((rate) => rate.period));
    for (const period of periods) {
      if (!ratePeriods.has(period)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['pricing', 'rates'],
          message: `A rate is required for ${period}`
        });
      }
    }
  }
  if (data.bookingConfig?.minUnits !== undefined
    && data.bookingConfig?.maxUnits !== undefined
    && data.bookingConfig.minUnits > data.bookingConfig.maxUnits) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['bookingConfig', 'maxUnits'],
      message: 'maxUnits must be greater than or equal to minUnits'
    });
  }
});

export const propertyIdParamSchema = z.object({ id: objectIdSchema }).strict();
export const mediaParamSchema = z.object({ id: objectIdSchema, mediaId: objectIdSchema }).strict();
export const reservationParamSchema = z.object({ id: objectIdSchema, reservationId: objectIdSchema }).strict();
export const changeRequestIdParamSchema = z.object({ id: objectIdSchema }).strict();
export const duplicateIdParamSchema = z.object({ id: objectIdSchema }).strict();

export const listPropertiesQuerySchema = paginationSchema.extend({
  listingStatus: z.enum(Object.values(LISTING_STATUS)).optional(),
  approvalStatus: z.enum(Object.values(APPROVAL_STATUS)).optional()
}).strict();

export const adminListPropertiesQuerySchema = listPropertiesQuerySchema.extend({
  ownerId: objectIdSchema.optional(),
  categoryId: objectIdSchema.optional()
});

export const submitSchema = z.object({
  note: z.string().trim().max(1000).optional()
}).strict();

export const approveSchema = z.object({
  note: z.string().trim().max(1000).optional()
}).strict();

export const rejectSchema = z.object({
  reason: z.string().trim().min(1).max(1000)
}).strict();

export const archiveSchema = z.object({
  reason: z.string().trim().max(1000).optional()
}).strict();

export const unarchiveSchema = z.object({
  reason: z.string().trim().max(1000).optional()
}).strict();

export const availabilityQuerySchema = z.object({
  checkIn: dateOnlySchema,
  checkOut: dateOnlySchema
}).strict().refine((value) => value.checkOut > value.checkIn, {
  message: 'checkOut must be after checkIn'
});

export const blockDatesSchema = z.object({
  dates: z.array(dateOnlySchema).min(1).max(366).optional(),
  isOpenForBooking: z.boolean().optional(),
  leadTimeDays: z.number().int().min(0).optional(),
  maxAdvanceDays: z.number().int().positive().optional(),
  note: z.string().trim().max(1000).optional()
}).strict().superRefine((data, ctx) => {
  const hasDates = Boolean(data.dates?.length);
  const hasControls = data.isOpenForBooking !== undefined
    || data.leadTimeDays !== undefined
    || data.maxAdvanceDays !== undefined;
  if (!hasDates && !hasControls) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Provide dates or availability controls' });
  }
});

export const mediaPatchSchema = z.object({
  isCover: z.literal(true).optional(),
  displayOrder: z.number().int().min(0).optional()
}).strict().refine((value) => value.isCover !== undefined || value.displayOrder !== undefined, {
  message: 'Provide isCover or displayOrder'
});

export const adminListChangeRequestsQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'withdrawn', 'expired']).optional()
}).strict();

export const changeRequestReviewBodySchema = z.object({
  note: z.string().trim().max(1000).optional(),
  reason: z.string().trim().min(1).max(1000).optional()
}).strict();

export const adminListDuplicatesQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'confirmed', 'dismissed']).optional(),
  minScore: z.coerce.number().min(0).max(1).optional()
}).strict();

export const duplicateReviewBodySchema = z.object({
  note: z.string().trim().max(1000).optional()
}).strict();

export const reviewDecisionSchema = z.enum(['approve', 'reject']);
export const duplicateDecisionSchema = z.enum(['confirm', 'dismiss']);

export const lifecycleActionSchema = z.enum(['archive', 'delete']);
export const lifecycleStatusSchema = z.enum(['pending', 'approved', 'rejected']);

export const softDeleteSchema = z.object({
  reason: z.string().trim().min(1).max(1000)
}).strict();

export const lifecycleRequestCreateSchema = z.object({
  reason: z.string().trim().min(1).max(1000)
}).strict();

export const lifecycleRequestListQuerySchema = paginationSchema.extend({
  status: lifecycleStatusSchema.optional(),
  action: lifecycleActionSchema.optional()
}).strict();

export const lifecycleRequestIdParamSchema = z.object({ id: objectIdSchema }).strict();

export const lifecycleApproveSchema = z.object({
  note: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(1000).optional()
}).strict();

export const lifecycleRejectSchema = z.object({
  reason: z.string().trim().min(1).max(1000),
  note: z.string().trim().max(1000).optional()
}).strict();

export const changeRequestQuerySchema = paginationSchema.strict();
export const approvalHistoryQuerySchema = paginationSchema.strict();
