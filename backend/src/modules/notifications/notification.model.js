import mongoose from 'mongoose';

export const NOTIFICATION_TYPES = Object.freeze([
  'BookingRequested',
  'BookingConfirmed',
  'BookingRejected',
  'CancellationRequested',
  'BookingCancelled',
  'PropertySubmitted',
  'PropertyApproved',
  'PropertyRejected',
  'AccountDeletionRequested',
  'System'
]);

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: NOTIFICATION_TYPES,
    required: true
  },
  title: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  data: { type: mongoose.Schema.Types.Mixed, default: {} },
  isRead: { type: Boolean, default: false },
  readAt: { type: Date, default: null },
  delivery: {
    inApp: { type: Boolean, default: true },
    email: {
      type: String,
      enum: ['not_requested', 'queued', 'sent', 'failed'],
      default: 'not_requested'
    }
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high'],
    default: 'normal'
  },
  eventId: { type: String, default: null }
}, { timestamps: true });

notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ 'data.bookingId': 1 });
notificationSchema.index(
  { userId: 1, eventId: 1 },
  { unique: true, partialFilterExpression: { eventId: { $type: 'string' } } }
);

export const Notification = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
