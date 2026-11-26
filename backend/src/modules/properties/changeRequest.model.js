import mongoose from 'mongoose';

const CHANGE_REQUEST_STATUSES = ['pending', 'approved', 'rejected', 'withdrawn', 'expired'];

const changeRequestSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: CHANGE_REQUEST_STATUSES, default: 'pending', required: true },
  reason: { type: String, default: null },
  requestedChanges: { type: mongoose.Schema.Types.Mixed, required: true },
  currentSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  proposedSnapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  changeSummary: {
    type: [{
      field: { type: String, required: true },
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after: { type: mongoose.Schema.Types.Mixed, default: null }
    }],
    default: []
  },
  review: {
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },
    reason: { type: String, default: null },
    note: { type: String, default: null }
  },
  appliedAt: { type: Date, default: null },
  appliedVersion: { type: Number, default: null }
}, { timestamps: true });

changeRequestSchema.index({ propertyId: 1, status: 1, createdAt: -1 });
changeRequestSchema.index({ ownerId: 1, createdAt: -1 });
changeRequestSchema.index({ status: 1, createdAt: 1 });

export const ChangeRequest = mongoose.models.PropertyChangeRequest
  || mongoose.model('PropertyChangeRequest', changeRequestSchema);
