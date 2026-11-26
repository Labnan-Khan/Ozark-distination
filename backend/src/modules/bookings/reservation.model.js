import mongoose from 'mongoose';
import { RESERVATION_SOURCES } from '../../shared/constants/index.js';

const reservationSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  date: { type: Date, required: true },
  bookingId: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  source: { type: String, enum: Object.values(RESERVATION_SOURCES), default: RESERVATION_SOURCES.BOOKING },
  note: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
}, { timestamps: true });

reservationSchema.index({ propertyId: 1, date: 1 }, { unique: true });
reservationSchema.index({ bookingId: 1 }, { sparse: true });

export const AvailabilityReservation = mongoose.models.AvailabilityReservation
  || mongoose.model('AvailabilityReservation', reservationSchema);
