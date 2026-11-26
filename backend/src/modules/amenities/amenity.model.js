import mongoose from 'mongoose';

const amenitySchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: null, trim: true, maxlength: 2000 },
  icon: { type: String, default: null, trim: true },
  isActive: { type: Boolean, default: true },
  categoryIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'PropertyCategory', default: [] },
  sortOrder: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

amenitySchema.index({ isActive: 1, sortOrder: 1 });
amenitySchema.index({ categoryIds: 1 });
amenitySchema.index({ deletedAt: 1 }, { sparse: true });

amenitySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const Amenity = mongoose.models.Amenity || mongoose.model('Amenity', amenitySchema);
