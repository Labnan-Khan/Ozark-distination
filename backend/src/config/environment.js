import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(12),
  CORS_ORIGIN: z.string().default('*'),
  TRUST_PROXY: z.coerce.number().int().default(0),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
  LOGIN_RATE_MAX: z.coerce.number().int().positive().default(10),
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().optional().default(587),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  MAIL_FROM: z.string().default('no-reply@example.com'),
  STORAGE_PROVIDER: z.enum(['memory', 'cloudinary']).default('memory'),
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),
  CLOUDINARY_FOLDER: z.string().default('property-rental'),
  SEED_ADMIN_EMAIL: z.string().trim().toLowerCase().email().default('admin@example.com'),
  SEED_ADMIN_PASSWORD: z.string().min(12).default('ChangeMe123456!'),
  SEED_ADMIN_NAME: z.string().trim().min(2).default('Platform Admin'),
  CLIENT_URL: z.string().url().optional().default('http://localhost:5173'),

  DEFAULT_CURRENCY: z.string().length(3).default('PKR'),
  MAX_IMAGES_PER_PROPERTY: z.coerce.number().int().positive().default(10),
  MAX_ADVANCE_DAYS: z.coerce.number().int().positive().default(365),
  LEAD_TIME_DAYS: z.coerce.number().int().min(0).default(0),
  WORKER_POLL_MS: z.coerce.number().int().positive().default(2000),
  WORKER_BATCH_SIZE: z.coerce.number().int().positive().default(20),
  SCHEDULER_TICK_MS: z.coerce.number().int().positive().default(60000),
  SCHEDULER_AVAILABILITY_INTERVAL_MS: z.coerce.number().int().positive().default(3600000),
  SCHEDULER_SESSION_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(86400000),
  SCHEDULER_MEDIA_CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(3600000),
  SCHEDULER_REMINDER_INTERVAL_MS: z.coerce.number().int().positive().default(3600000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().default(100)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = Object.freeze(parsed.data);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
