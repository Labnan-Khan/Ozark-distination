import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { env, isTest } from '../../config/environment.js';
import { logger } from '../logging/index.js';
import { eventBus } from '../events/index.js';
import { jobQueue } from './index.js';
import { sleep, toDateOnly } from '../../shared/utils/index.js';
import { BOOKING_STATUS, EVENT_TYPES } from '../../shared/constants/index.js';
import { Session, PasswordResetToken } from '../../modules/auth/auth.model.js';
import { Booking } from '../../modules/bookings/booking.model.js';
import { Media } from '../../modules/media/media.model.js';
import { Property } from '../../modules/properties/property.model.js';
import { User } from '../../modules/users/user.model.js';
import { propertiesService } from '../../modules/properties/index.js';
import { createStatusServer, closeStatusServer } from './statusServer.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function addDays(date, days) {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function dateKey(value) {
  return toDateOnly(value).toISOString().slice(0, 10);
}

async function refreshAvailability() {
  const staleBefore = new Date(Date.now() - env.SCHEDULER_AVAILABILITY_INTERVAL_MS);
  const properties = await Property.find({
    deletedAt: null,
    $or: [
      { 'availability.statusCalculatedAt': { $exists: false } },
      { 'availability.statusCalculatedAt': { $lte: staleBefore } }
    ]
  })
    .select('_id')
    .limit(env.SCHEDULER_BATCH_SIZE)
    .lean();

  let updated = 0;
  for (const property of properties) {
    const result = await propertiesService.recomputeAvailability(property._id);
    if (result) updated += 1;
  }
  return { scanned: properties.length, updated };
}

async function cleanupSessions() {
  const now = new Date();
  const revokedBefore = new Date(now.getTime() - 30 * DAY_MS);
  const [sessions, resetTokens] = await Promise.all([
    Session.deleteMany({
      $or: [{ expiresAt: { $lte: now } }, { revokedAt: { $lte: revokedBefore } }]
    }),
    PasswordResetToken.deleteMany({ expiresAt: { $lte: now } })
  ]);
  return { sessions: sessions.deletedCount, resetTokens: resetTokens.deletedCount };
}

async function cleanupMedia() {
  const staleBefore = new Date(Date.now() - HOUR_MS);
  const pending = await Media.find({ status: 'pending_delete', createdAt: { $lte: staleBefore } })
    .select('_id')
    .limit(env.SCHEDULER_BATCH_SIZE)
    .lean();

  let enqueued = 0;
  for (const media of pending) {
    try {
      await jobQueue.cleanupMedia(String(media._id), {
        idempotencyKey: `media:cleanup:${String(media._id)}`
      });
      enqueued += 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }

  const active = await Media.find({
    status: 'active',
    'attachedTo.type': { $in: ['property', 'user'] }
  })
    .select('attachedTo')
    .limit(env.SCHEDULER_BATCH_SIZE * 5)
    .lean();

  const propertyIds = [...new Set(active.filter((item) => item.attachedTo?.type === 'property').map((item) => String(item.attachedTo.id)))];
  const userIds = [...new Set(active.filter((item) => item.attachedTo?.type === 'user').map((item) => String(item.attachedTo.id)))];

  const [existingProperties, existingUsers] = await Promise.all([
    propertyIds.length ? Property.find({ _id: { $in: propertyIds } }).select('_id').lean() : [],
    userIds.length ? User.find({ _id: { $in: userIds } }).select('_id').lean() : []
  ]);

  const existing = new Set([
    ...existingProperties.map((item) => `property:${String(item._id)}`),
    ...existingUsers.map((item) => `user:${String(item._id)}`)
  ]);

  let orphaned = 0;
  for (const media of active) {
    const key = `${media.attachedTo.type}:${String(media.attachedTo.id)}`;
    if (existing.has(key)) continue;
    await Media.updateOne({ _id: media._id, status: 'active' }, { $set: { status: 'pending_delete' } });
    orphaned += 1;
  }

  return { enqueued, orphaned };
}

async function bookingReminders() {
  const today = toDateOnly(new Date());
  const dayAfterTomorrow = addDays(today, 2);
  const bookings = await Booking.find({
    status: BOOKING_STATUS.CONFIRMED,
    checkInDate: { $gte: today, $lt: dayAfterTomorrow }
  })
    .select('reference propertyId customerId ownerId propertySnapshot checkInDate checkOutDate')
    .limit(env.SCHEDULER_BATCH_SIZE)
    .lean();

  let enqueued = 0;
  for (const booking of bookings) {
    const checkIn = dateKey(booking.checkInDate);
    try {
      await eventBus.publish({
        type: EVENT_TYPES.BOOKING_REMINDER,
        payload: {
          bookingId: String(booking._id),
          reference: booking.reference,
          propertyId: String(booking.propertyId),
          customerId: String(booking.customerId),
          ownerId: String(booking.ownerId),
          title: booking.propertySnapshot?.title || null,
          checkIn,
          checkOut: dateKey(booking.checkOutDate)
        },
        idempotencyKey: `booking:reminder:${String(booking._id)}:${checkIn}`,
        maxAttempts: 5
      });
      enqueued += 1;
    } catch (error) {
      if (error?.code !== 11000) throw error;
    }
  }
  return { scanned: bookings.length, enqueued };
}

const jobs = Object.freeze([
  { name: 'availability', interval: () => env.SCHEDULER_AVAILABILITY_INTERVAL_MS, run: refreshAvailability },
  { name: 'sessions', interval: () => env.SCHEDULER_SESSION_CLEANUP_INTERVAL_MS, run: cleanupSessions },
  { name: 'media', interval: () => env.SCHEDULER_MEDIA_CLEANUP_INTERVAL_MS, run: cleanupMedia },
  { name: 'reminders', interval: () => env.SCHEDULER_REMINDER_INTERVAL_MS, run: bookingReminders }
]);

export async function runScheduledJobs(names = null) {
  const results = {};
  for (const job of jobs) {
    if (names && !names.includes(job.name)) continue;
    try {
      results[job.name] = await job.run();
      logger.info({ job: job.name, result: results[job.name] }, 'scheduled job completed');
    } catch (error) {
      results[job.name] = { error: error.message };
      logger.error({ err: error, job: job.name }, 'scheduled job failed');
    }
  }
  return results;
}

let running = false;
let statusServer;

// PM2 forks through ProcessContainerFork.js, so argv[1] is not our script.
const invokedScript = process.env.pm_exec_path || process.argv[1] || '';

export async function startScheduler() {
  if (running) return;
  running = true;
  await connectDatabase();
  const lastRun = new Map();
  logger.info('Scheduler started');
  if (process.send) process.send('ready');

  while (running) {
    const now = Date.now();
    for (const job of jobs) {
      const previous = lastRun.get(job.name) || 0;
      if (now - previous < job.interval()) continue;
      try {
        await job.run();
        lastRun.set(job.name, now);
      } catch (error) {
        logger.error({ err: error, job: job.name }, 'scheduled job failed');
        lastRun.set(job.name, now);
      }
    }
    await sleep(env.SCHEDULER_TICK_MS);
    if (isTest) break;
  }
}

export async function stopScheduler() {
  running = false;
}

if (invokedScript.endsWith('scheduler.js')) {
  if (process.argv.includes('--once')) {
    connectDatabase()
      .then(() => runScheduledJobs())
      .then(disconnectDatabase)
      .catch(async (error) => {
        logger.fatal({ err: error }, 'scheduler run failed');
        await disconnectDatabase();
        process.exit(1);
      });
  } else {
    statusServer = createStatusServer('scheduler');
    if (process.send) process.send('ready');

    startScheduler().catch(async (error) => {
      logger.fatal({ err: error }, 'scheduler failed to start');
      await disconnectDatabase();
      await closeStatusServer(statusServer);
      process.exit(1);
    });

    const shutdown = async () => {
      await stopScheduler();
      await disconnectDatabase();
      await closeStatusServer(statusServer);
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }
}
