import mongoose from 'mongoose';
import {
  APPROVAL_STATUS,
  ATTRIBUTE_TYPES,
  AVAILABILITY_STATUS,
  BOOKING_MODES,
  LISTING_STATUS,
  RENTAL_PERIODS
} from '../../shared/constants/index.js';

const attributeValueSchema = new mongoose.Schema({
  key: { type: String, required: true },
  dataType: { type: String, enum: Object.values(ATTRIBUTE_TYPES), required: true },
  stringValue: { type: String, default: null },
  numberValue: { type: Number, default: null },
  booleanValue: { type: Boolean, default: null },
  dateValue: { type: Date, default: null },
  arrayValue: { type: [mongoose.Schema.Types.Mixed], default: [] },
  unit: { type: String, default: null },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyCategory', default: null },
  schemaVersion: { type: Number, default: 1 }
}, { _id: false });

const addressSchema = new mongoose.Schema({
  country: { type: String, required: true, trim: true },
  stateProvince: { type: String, default: null, trim: true },
  city: { type: String, required: true, trim: true },
  area: { type: String, default: null, trim: true },
  street: { type: String, required: true, trim: true },
  unitNumber: { type: String, default: null, trim: true },
  fullAddress: { type: String, default: null, trim: true },
  postalCode: { type: String, default: null, trim: true }
}, { _id: false });

const rateSchema = new mongoose.Schema({
  period: { type: String, enum: Object.values(RENTAL_PERIODS), required: true },
  amountMinor: { type: Number, required: true, min: 0 },
  label: { type: String, default: null }
}, { _id: false });

const pricingSchema = new mongoose.Schema({
  currency: { type: String, required: true, uppercase: true, match: /^[A-Z]{3}$/ },
  defaultPeriod: { type: String, enum: Object.values(RENTAL_PERIODS), required: true },
  rates: { type: [rateSchema], default: [] },
  requiresDeposit: { type: Boolean, default: false },
  depositMinor: { type: Number, default: null, min: 0 },
  additionalCharges: { type: [mongoose.Schema.Types.Mixed], default: [] },
  taxConfig: { type: mongoose.Schema.Types.Mixed, default: null },
  version: { type: Number, default: 1 },
  updatedAt: { type: Date, default: () => new Date() }
}, { _id: false });

const bookingConfigSchema = new mongoose.Schema({
  mode: { type: String, enum: Object.values(BOOKING_MODES), required: true },
  minUnits: { type: Number, default: 1, min: 1 },
  maxUnits: { type: Number, default: 1, min: 1 },
  requireGuestCount: { type: Boolean, default: false },
  maxGuests: { type: Number, default: null, min: 1 },
  sameDayCheckInAllowed: { type: Boolean, default: false },
  cancellationPolicyId: { type: mongoose.Schema.Types.ObjectId, default: null },
  autoExpireMinutes: { type: Number, default: null, min: 1 },
  bookingWindowDays: { type: Number, default: 365, min: 1 }
}, { _id: false });

const availabilitySchema = new mongoose.Schema({
  isOpenForBooking: { type: Boolean, default: true },
  leadTimeDays: { type: Number, default: 0, min: 0 },
  maxAdvanceDays: { type: Number, default: 365, min: 1 },
  status: {
    type: String,
    enum: Object.values(AVAILABILITY_STATUS),
    default: AVAILABILITY_STATUS.AVAILABLE
  },
  statusCalculatedAt: { type: Date, default: null },
  note: { type: String, default: null }
}, { _id: false });

const propertySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true, minlength: 5, maxlength: 150 },
  description: { type: String, required: true, trim: true, maxlength: 10000 },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  ownerSnapshot: {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fullName: { type: String, required: true }
  },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyCategory', required: true },
  subcategoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'PropertyCategory', default: null },
  categorySnapshot: {
    code: { type: String, required: true },
    name: { type: String, required: true },
    group: { type: String, required: true },
    attributeSchemaVersion: { type: Number, default: 1 }
  },
  address: { type: addressSchema, required: true },
  location: {
    type: mongoose.Schema.Types.Mixed,
    default: null,
    validate: {
      validator(value) {
        if (value === null || value === undefined) return true;
        const coordinates = value?.coordinates;
        return value?.type === 'Point'
          && Array.isArray(coordinates)
          && coordinates.length === 2
          && coordinates[0] >= -180 && coordinates[0] <= 180
          && coordinates[1] >= -90 && coordinates[1] <= 90;
      },
      message: 'location must be a GeoJSON Point with [longitude, latitude] coordinates'
    }
  },
  attributes: { type: [attributeValueSchema], default: [] },
  amenities: { type: [mongoose.Schema.Types.ObjectId], ref: 'Amenity', default: [] },
  amenitySnapshot: {
    type: [{
      id: { type: mongoose.Schema.Types.ObjectId, default: null },
      code: { type: String, default: null },
      name: { type: String, default: null }
    }],
    default: []
  },
  pricing: { type: pricingSchema, required: true },
  rentalPeriods: {
    type: [{ type: String, enum: Object.values(RENTAL_PERIODS) }],
    default: [RENTAL_PERIODS.MONTHLY]
  },
  bookingConfig: { type: bookingConfigSchema, required: true },
  availability: { type: availabilitySchema, required: true, default: () => ({}) },
  media: {
    coverMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
    imageCount: { type: Number, default: 0, min: 0 },
    maxImages: { type: Number, default: 10, min: 1 }
  },
  listingStatus: {
    type: String,
    enum: Object.values(LISTING_STATUS),
    default: LISTING_STATUS.DRAFT,
    required: true
  },
  approvalStatus: {
    type: String,
    enum: Object.values(APPROVAL_STATUS),
    default: APPROVAL_STATUS.PENDING,
    required: true
  },
  submittedAt: { type: Date, default: null },
  approvedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
  archivedAt: { type: Date, default: null },
  approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  approvalReason: { type: String, default: null },
  changeRequestVersion: { type: Number, default: 0, min: 0 },
  parentPropertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', default: null },
  duplicateScore: { type: Number, default: null, min: 0, max: 1 },
  searchKeywords: { type: [String], default: [] },
  deletedAt: { type: Date, default: null },
  deletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  deleteReason: { type: String, default: null },
  schemaVersion: { type: Number, default: 1 }
}, { timestamps: true });

propertySchema.index({ ownerId: 1, createdAt: -1 });
propertySchema.index({ listingStatus: 1, approvalStatus: 1, createdAt: -1 });
propertySchema.index({ categoryId: 1, listingStatus: 1, approvalStatus: 1 });
propertySchema.index({ location: '2dsphere' });
propertySchema.index({ 'address.country': 1, 'address.stateProvince': 1, 'address.city': 1 });
propertySchema.index({ 'attributes.key': 1, 'attributes.numberValue': 1 });
propertySchema.index({ 'attributes.key': 1, 'attributes.stringValue': 1 });
propertySchema.index({ 'pricing.rates.period': 1, 'pricing.rates.amountMinor': 1 });
propertySchema.index({ searchKeywords: 'text', title: 'text', description: 'text' });
propertySchema.index({ approvalStatus: 1, submittedAt: 1 }, { sparse: true });
propertySchema.index({ parentPropertyId: 1 }, { sparse: true });
propertySchema.index({ deletedAt: 1 }, { sparse: true });

export const Property = mongoose.models.Property || mongoose.model('Property', propertySchema);
