import mongoose from 'mongoose';
import { BOOKING_STATUS } from '../../shared/constants/index.js';

const bookingHistorySchema = new mongoose.Schema({
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', required: true, index: true },
  fromStatus: { type: String, enum: Object.values(BOOKING_STATUS), required: true },
  toStatus: { type: String, enum: Object.values(BOOKING_STATUS), required: true },
  action: { type: String, required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  reason: { type: String, default: null },
  note: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: true });

bookingHistorySchema.index({ actorId: 1, createdAt: -1 });

export const BookingHistory = mongoose.models.BookingHistory || mongoose.model('BookingHistory', bookingHistorySchema);
