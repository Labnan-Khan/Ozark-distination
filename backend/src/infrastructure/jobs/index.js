import { EVENT_TYPES } from '../../shared/constants/index.js';
import { eventBus } from '../events/index.js';

export const jobQueue = {
  async enqueue(type, payload, options = {}) {
    return eventBus.publish({
      type,
      payload,
      correlationId: options.correlationId || null,
      idempotencyKey: options.idempotencyKey,
      maxAttempts: options.maxAttempts || 5
    }, options.session);
  },

  sendEmail(message, options = {}) {
    return this.enqueue(EVENT_TYPES.SEND_EMAIL, message, options);
  },

  cleanupMedia(mediaId, options = {}) {
    return this.enqueue(EVENT_TYPES.MEDIA_CLEANUP_REQUESTED, { mediaId }, options);
  }
};
