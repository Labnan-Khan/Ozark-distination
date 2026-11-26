import mongoose from 'mongoose';

export const PROPERTY_LIFECYCLE_ACTIONS = Object.freeze(['archive', 'delete']);
export const PROPERTY_LIFECYCLE_STATUSES = Object.freeze(['pending', 'approved', 'rejected']);

const propertyLifecycleRequestSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  action: {
    type: String,
    enum: PROPERTY_LIFECYCLE_ACTIONS,
    required: true
  },
  reason: { type: String, default: null },
  status: {
    type: String,
    enum: PROPERTY_LIFECYCLE_STATUSES,
    default: 'pending',
    required: true
  },
  currentSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
  note: { type: String, default: null },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null }
}, { timestamps: true });

propertyLifecycleRequestSchema.index({ status: 1 });
propertyLifecycleRequestSchema.index({ propertyId: 1 });
propertyLifecycleRequestSchema.index({ ownerId: 1 });
propertyLifecycleRequestSchema.index({ status: 1, createdAt: -1 });
propertyLifecycleRequestSchema.index({ propertyId: 1, status: 1, createdAt: -1 });
propertyLifecycleRequestSchema.index({ ownerId: 1, createdAt: -1 });

export const PropertyLifecycleRequest = mongoose.models.PropertyLifecycleRequest
  || mongoose.model('PropertyLifecycleRequest', propertyLifecycleRequestSchema);
