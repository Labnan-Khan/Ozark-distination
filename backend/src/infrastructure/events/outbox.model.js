import mongoose from 'mongoose';

const eventOutboxSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  type: { type: String, required: true, index: true },
  version: { type: Number, default: 1 },
  payload: { type: mongoose.Schema.Types.Mixed, default: {} },
  actor: { type: mongoose.Schema.Types.Mixed, default: null },
  correlationId: { type: String, default: null },
  idempotencyKey: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'processing', 'done', 'failed', 'dead'],
    default: 'pending',
    index: true
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 5 },
  nextAttemptAt: { type: Date, default: Date.now },
  lastError: { type: String, default: null },
  processedAt: { type: Date, default: null }
}, { timestamps: true });

eventOutboxSchema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });
eventOutboxSchema.index({ type: 1, status: 1 });
eventOutboxSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });

export const EventOutbox = mongoose.models.EventOutbox || mongoose.model('EventOutbox', eventOutboxSchema);
