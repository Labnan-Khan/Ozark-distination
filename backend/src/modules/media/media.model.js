import mongoose from 'mongoose';
import { MEDIA_RESOURCE_TYPES } from '../../shared/constants/index.js';

const mediaSchema = new mongoose.Schema({
  attachedTo: {
    type: {
      type: String,
      enum: ['property', 'user'],
      required: true
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    }
  },
  provider: {
    type: String,
    enum: ['cloudinary', 's3', 'memory'],
    default: 'cloudinary',
    required: true
  },
  providerPublicId: { type: String, required: true, trim: true },
  url: { type: String, required: true },
  secureUrl: { type: String, required: true },
  resourceType: {
    type: String,
    enum: Object.values(MEDIA_RESOURCE_TYPES),
    default: MEDIA_RESOURCE_TYPES.IMAGE
  },
  mimeType: { type: String, required: true },
  format: { type: String, required: true },
  bytes: { type: Number, default: null },
  width: { type: Number, default: null },
  height: { type: Number, default: null },
  alt: { type: String, default: null, trim: true },
  displayOrder: { type: Number, default: 0 },
  isCover: { type: Boolean, default: false },
  status: {
    type: String,
    enum: ['active', 'pending_delete', 'deleted'],
    default: 'active'
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { timestamps: true });

mediaSchema.index({ provider: 1, providerPublicId: 1 }, { unique: true });
mediaSchema.index({ 'attachedTo.type': 1, 'attachedTo.id': 1, displayOrder: 1 });
mediaSchema.index({ status: 1, createdAt: 1 });
mediaSchema.index({ isCover: 1 }, { sparse: true });

mediaSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  }
});

export const Media = mongoose.models.Media || mongoose.model('Media', mediaSchema);
