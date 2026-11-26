import crypto from 'node:crypto';
import { EventOutbox } from './outbox.model.js';
import { logger } from '../logging/index.js';

const handlers = new Map();

function buildEvent(input) {
  return {
    eventId: input.eventId || crypto.randomUUID(),
    type: input.type,
    version: input.version || 1,
    payload: input.payload || {},
    actor: input.actor || null,
    correlationId: input.correlationId || null,
    idempotencyKey: input.idempotencyKey || `${input.type}:${crypto.randomUUID()}`,
    status: 'pending',
    attempts: 0,
    maxAttempts: input.maxAttempts || 5
  };
}

export const eventBus = {
  subscribe(type, handler) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(handler);
  },

  async publish(input, session) {
    const event = buildEvent(input);
    const [document] = await EventOutbox.create([event], session ? { session } : undefined);
    return document;
  },

  async publishMany(inputs, session) {
    if (!inputs?.length) return [];
    return EventOutbox.create(
      inputs.map(buildEvent),
      session ? { session, ordered: true } : undefined
    );
  },

  async dispatchPending({ limit = 20 } = {}) {
    const now = new Date();
    const staleBefore = new Date(Date.now() - 5 * 60 * 1000);
    await EventOutbox.updateMany(
      { status: 'processing', nextAttemptAt: { $lte: staleBefore } },
      {
        $set: { status: 'failed', nextAttemptAt: now, lastError: 'Reclaimed stale processing event' },
        $inc: { attempts: 1 }
      }
    );

    const documents = await EventOutbox.find({
      status: { $in: ['pending', 'failed'] },
      nextAttemptAt: { $lte: now }
    }).sort({ createdAt: 1 }).limit(limit).lean();

    let processed = 0;
    for (const event of documents) {
      try {
        const claimed = await EventOutbox.updateOne(
          { _id: event._id, status: { $in: ['pending', 'failed'] } },
          { $set: { status: 'processing' } }
        );
        if (!claimed.modifiedCount) continue;
        const subscribers = handlers.get(event.type) || [];
        for (const handler of subscribers) {
          await handler(event);
        }
        await EventOutbox.updateOne(
          { _id: event._id },
          { $set: { status: 'done', processedAt: new Date(), lastError: null } }
        );
        processed += 1;
      } catch (error) {
        const attempts = (event.attempts || 0) + 1;
        const status = attempts >= event.maxAttempts ? 'dead' : 'failed';
        const delay = Math.min(60000, 1000 * 2 ** attempts);
        await EventOutbox.updateOne(
          { _id: event._id },
          {
            $set: {
              status,
              attempts,
              lastError: String(error?.message || error).slice(0, 1000),
              nextAttemptAt: new Date(Date.now() + delay)
            }
          }
        );
        logger.error({ eventId: event.eventId, type: event.type, err: error }, 'event handler failed');
      }
    }
    return processed;
  },

  async markDone(eventId) {
    await EventOutbox.updateOne({ eventId }, { $set: { status: 'done', processedAt: new Date() } });
  }
};

export function registerEventHandlers() {
  // Populated by infrastructure/events/registerHandlers.js after all modules load.
}
