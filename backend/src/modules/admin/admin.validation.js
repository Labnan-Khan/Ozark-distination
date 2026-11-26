import { z } from 'zod';
import { ACCOUNT_STATUS, ROLES } from '../../shared/constants/index.js';
import {
  dateOnlySchema,
  emailSchema,
  objectIdSchema,
  paginationSchema,
  passwordSchema,
  phoneSchema
} from '../../shared/validators/index.js';

/** Statuses an admin may set through the status-update endpoint. */
export const ADMIN_ACCOUNT_STATUSES = Object.freeze([
  ACCOUNT_STATUS.ACTIVE,
  ACCOUNT_STATUS.SUSPENDED,
  ACCOUNT_STATUS.DEACTIVATED
]);

export const createAdminSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: emailSchema,
  password: passwordSchema,
  phone: phoneSchema
}).strict();

export const statusUpdateSchema = z.object({
  accountStatus: z.enum(ADMIN_ACCOUNT_STATUSES),
  reason: z.string().trim().max(500).optional().nullable()
}).strict().superRefine((value, ctx) => {
  if (value.accountStatus !== ACCOUNT_STATUS.ACTIVE && !String(value.reason || '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['reason'],
      message: 'A reason is required when suspending or deactivating an account'
    });
  }
});

const reviewBaseSchema = z.object({
  decision: z.enum(['approve', 'reject']),
  note: z.string().trim().max(1000).optional()
}).strict();

export const reviewSchema = reviewBaseSchema.superRefine((value, ctx) => {
  if (value.decision === 'reject' && !String(value.note || '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['note'],
      message: 'A note or reason is required when rejecting a deletion request'
    });
  }
});

export const approveSchema = z.object({
  note: z.string().trim().max(1000).optional()
}).strict();

export const rejectSchema = z.object({
  note: z.string().trim().min(1).max(1000)
}).strict();

export const directDeleteSchema = z.object({
  reason: z.string().trim().min(1).max(500)
}).strict();

export const settingUpdateSchema = z.object({
  value: z.any().refine((value) => value !== undefined, { message: 'Value is required' })
}).strict();

export const idParamSchema = z.object({ id: objectIdSchema }).strict();

export const settingKeyParamSchema = z.object({
  key: z.string().trim().min(1).max(150)
}).strict();

export const listUsersQuerySchema = paginationSchema.extend({
  role: z.enum(Object.values(ROLES)).optional(),
  accountStatus: z.enum(Object.values(ACCOUNT_STATUS)).optional(),
  q: z.string().trim().max(100).optional()
});

export const listDeletionRequestsQuerySchema = paginationSchema.extend({
  status: z.enum(['pending', 'approved', 'rejected', 'completed']).optional()
});

export const auditLogQuerySchema = paginationSchema.extend({
  actorId: objectIdSchema.optional(),
  action: z.string().trim().max(100).optional(),
  entityType: z.string().trim().max(50).optional(),
  entityId: z.string().trim().max(100).optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional()
});

export const bookingReportQuerySchema = paginationSchema.extend({
  from: dateOnlySchema,
  to: dateOnlySchema,
  groupBy: z.enum(['day', 'city', 'category']).default('day')
});
