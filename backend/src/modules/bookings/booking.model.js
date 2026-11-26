import mongoose from 'mongoose';
import { BOOKING_MODES, BOOKING_STATUS, PAYMENT_STATUS } from '../../shared/constants/index.js';

const bookingSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true },
  customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true, index: true },
  propertySnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  checkInDate: { type: Date, required: true },
  checkOutDate: { type: Date, required: true },
  rentalPeriod: { type: String, required: true },
  units: { type: Number, default: 1 },
  guests: { type: Number, default: null },
  priceSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  bookingModeSnapshot: { type: String, enum: Object.values(BOOKING_MODES), required: true },
  status: {
    type: String,
    enum: Object.values(BOOKING_STATUS),
    default: BOOKING_STATUS.PENDING,
    index: true
  },
  statusBeforeCancellationRequest: { type: String, enum: Object.values(BOOKING_STATUS), default: null },
  payment: {
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.NOT_APPLICABLE },
    reference: { type: String, default: null },
    provider: { type: String, default: null },
    updatedAt: { type: Date, default: null }
  },
  specialRequests: { type: String, default: null },
  approval: {
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    note: { type: String, default: null }
  },
  cancellation: {
    status: {
      type: String,
      enum: ['none', 'requested', 'approved', 'rejected', 'admin_cancelled'],
      default: 'none'
    },
    reason: { type: String, default: null },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedAt: { type: Date, default: null },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    note: { type: String, default: null }
  },
  expiresAt: { type: Date, default: null },
  source: { type: String, enum: ['customer', 'owner', 'admin'], default: 'customer' },
  schemaVersion: { type: Number, default: 1 }
}, { timestamps: true });

bookingSchema.index({ propertyId: 1, checkInDate: 1, checkOutDate: 1 });
bookingSchema.index({ propertyId: 1, status: 1, checkInDate: 1 });
bookingSchema.index({ status: 1, expiresAt: 1 }, { sparse: true });
bookingSchema.index({ createdAt: -1 });

bookingSchema.pre('validate', function ensureChronology() {
  if (this.checkOutDate <= this.checkInDate) {
    this.invalidate('checkOutDate', 'checkOutDate must be after checkInDate');
  }
});

export const Booking = mongoose.models.Booking || mongoose.model('Booking', bookingSchema);
