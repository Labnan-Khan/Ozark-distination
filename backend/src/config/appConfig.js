import { env } from './environment.js';

export const appConfig = Object.freeze({
  apiPrefix: '/api/v1',
  jwt: {
    secret: env.JWT_SECRET,
    accessTtl: env.JWT_ACCESS_TTL,
    refreshTtlDays: env.JWT_REFRESH_TTL_DAYS
  },
  security: {
    bcryptRounds: env.BCRYPT_ROUNDS,
    corsOrigin: env.CORS_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    rateLimit: {
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX
    },
    loginRateMax: env.LOGIN_RATE_MAX
  },
  defaults: {
    currency: env.DEFAULT_CURRENCY,
    maxImagesPerProperty: env.MAX_IMAGES_PER_PROPERTY,
    maxAdvanceDays: env.MAX_ADVANCE_DAYS,
    leadTimeDays: env.LEAD_TIME_DAYS
  },
  worker: {
    pollMs: env.WORKER_POLL_MS,
    batchSize: env.WORKER_BATCH_SIZE
  },
  providers: {
    email: env.EMAIL_PROVIDER,
    storage: env.STORAGE_PROVIDER
  }
});
