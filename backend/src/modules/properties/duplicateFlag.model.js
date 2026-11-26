import mongoose from 'mongoose';

const DUPLICATE_STRATEGIES = [
  'exact_address',
  'geo_proximity',
  'attribute_similarity',
  'unit_number',
  'external_id'
];

const duplicateFlagSchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  matchedPropertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  strategy: { type: String, enum: DUPLICATE_STRATEGIES, required: true },
  strategyVersion: { type: Number, required: true },
  score: { type: Number, required: true, min: 0, max: 1 },
  signals: {
    type: [{
      field: { type: String, required: true },
      value: { type: mongoose.Schema.Types.Mixed, default: null },
      weight: { type: Number, default: 0 }
    }],
    default: []
  },
  status: { type: String, enum: ['pending', 'confirmed', 'dismissed'], default: 'pending', required: true },
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  reviewedAt: { type: Date, default: null },
  note: { type: String, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

duplicateFlagSchema.index({ status: 1, score: -1 });
duplicateFlagSchema.index({ propertyId: 1, createdAt: -1 });
duplicateFlagSchema.index(
  { propertyId: 1, matchedPropertyId: 1, strategy: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } }
);

export const DuplicateFlag = mongoose.models.DuplicateFlag
  || mongoose.model('DuplicateFlag', duplicateFlagSchema);
