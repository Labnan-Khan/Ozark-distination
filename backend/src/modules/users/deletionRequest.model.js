import mongoose from 'mongoose';

const deletionRequestSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  requestedBy: { type: String, enum: ['user', 'admin'], default: 'user' },
  reason: { type: String, default: null },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'completed'],
    default: 'pending',
    index: true
  },
  activeBookingCheck: {
    hasActive: { type: Boolean, default: false },
    bookingIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    checkedAt: { type: Date, default: Date.now }
  },
  review: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    note: { type: String, default: null }
  },
  processedAt: { type: Date, default: null }
}, { timestamps: true });

deletionRequestSchema.index({ status: 1, createdAt: 1 });

export const DeletionRequest = mongoose.models.DeletionRequest || mongoose.model('DeletionRequest', deletionRequestSchema);
