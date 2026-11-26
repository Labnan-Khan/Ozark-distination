import mongoose from 'mongoose';
import { ACCOUNT_STATUS, ROLES } from '../../shared/constants/index.js';

const userSchema = new mongoose.Schema({
  roles: {
    type: [String],
    enum: Object.values(ROLES),
    default: [ROLES.CUSTOMER],
    validate: {
      validator: (roles) => Array.isArray(roles) && roles.length === 1 && new Set(roles).size === roles.length,
      message: 'V1 requires exactly one unique role per account'
    }
  },
  accountStatus: {
    type: String,
    enum: Object.values(ACCOUNT_STATUS),
    default: ACCOUNT_STATUS.ACTIVE,
    index: true
  },
  fullName: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  emailVerifiedAt: { type: Date, default: null },
  passwordHash: { type: String, required: true, select: false },
  phone: { type: String, default: null, trim: true },
  profileMediaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Media', default: null },
  tokenVersion: { type: Number, default: 0 },
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: { type: Date, default: null },
  lastLoginAt: { type: Date, default: null },
  verification: {
    status: { type: String, enum: ['none', 'pending', 'verified'], default: 'none' },
    requestedAt: { type: Date, default: null },
    verifiedAt: { type: Date, default: null }
  },
  preferences: { type: mongoose.Schema.Types.Mixed, default: {} },
  extraPermissions: { type: [String], default: [] },
  deniedPermissions: { type: [String], default: [] },
  deletion: {
    requestedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    anonymizedAt: { type: Date, default: null }
  },
  schemaVersion: { type: Number, default: 1 },
  deletedAt: { type: Date, default: null }
}, { timestamps: true });

userSchema.index({ roles: 1, accountStatus: 1 });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ accountStatus: 1, createdAt: -1 });
userSchema.index({ deletedAt: 1 }, { sparse: true });

userSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.passwordHash;
    delete ret.__v;
    return ret;
  }
});

export const User = mongoose.models.User || mongoose.model('User', userSchema);
