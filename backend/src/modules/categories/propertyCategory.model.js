import mongoose from 'mongoose';
import { ATTRIBUTE_TYPES, CATEGORY_GROUPS, RENTAL_PERIODS } from '../../shared/constants/index.js';

const attributeOptionSchema = new mongoose.Schema({
  value: { type: String, required: true, trim: true },
  label: { type: String, required: true, trim: true }
}, { _id: false });

const attributeDefinitionSchema = new mongoose.Schema({
  key: { type: String, required: true, trim: true, lowercase: true },
  label: { type: String, required: true, trim: true },
  dataType: { type: String, required: true, enum: Object.values(ATTRIBUTE_TYPES) },
  required: { type: Boolean, default: false },
  unit: { type: String, default: null, trim: true },
  options: { type: [attributeOptionSchema], default: [] },
  min: { type: Number, default: null },
  max: { type: Number, default: null },
  minLength: { type: Number, default: null },
  maxLength: { type: Number, default: null },
  pattern: { type: String, default: null },
  defaultValue: { type: mongoose.Schema.Types.Mixed, default: null },
  searchable: { type: Boolean, default: false },
  filterable: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  deprecated: { type: Boolean, default: false },
  description: { type: String, default: null, trim: true }
}, { _id: false });

const propertyCategorySchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, trim: true, lowercase: true },
  name: { type: String, required: true, trim: true, maxlength: 120 },
  group: { type: String, required: true, enum: Object.values(CATEGORY_GROUPS) },
  parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyCategory', default: null },
  description: { type: String, default: null, trim: true, maxlength: 2000 },
  icon: { type: String, default: null, trim: true },
  isActive: { type: Boolean, default: true },
  sortOrder: { type: Number, default: 0 },
  allowedRentalPeriods: {
    type: [String],
    enum: Object.values(RENTAL_PERIODS),
    default: [RENTAL_PERIODS.MONTHLY]
  },
  attributeSchema: {
    type: [attributeDefinitionSchema],
    default: [],
    validate: {
      validator: (definitions) => new Set(definitions.map((definition) => definition.key)).size === definitions.length,
      message: 'Attribute keys must be unique within a category'
    }
  },
  attributeSchemaVersion: { type: Number, default: 1 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

propertyCategorySchema.index({ group: 1, isActive: 1, sortOrder: 1 });
propertyCategorySchema.index({ parentId: 1 });
propertyCategorySchema.index({ isActive: 1 });
propertyCategorySchema.index({ deletedAt: 1 }, { sparse: true });

propertyCategorySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v;
    return ret;
  }
});

export const PropertyCategory = mongoose.models.PropertyCategory || mongoose.model('PropertyCategory', propertyCategorySchema);
