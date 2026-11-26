import mongoose from 'mongoose';
import { APPROVAL_STATUS } from '../../shared/constants/index.js';

const APPROVAL_ACTIONS = ['submit', 'approve', 'reject', 'resubmit'];

const approvalHistorySchema = new mongoose.Schema({
  propertyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Property', required: true },
  action: { type: String, enum: APPROVAL_ACTIONS, required: true },
  fromStatus: { type: String, enum: Object.values(APPROVAL_STATUS), required: true },
  toStatus: { type: String, enum: Object.values(APPROVAL_STATUS), required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  actorRole: { type: String, required: true },
  reason: { type: String, default: null },
  snapshot: { type: mongoose.Schema.Types.Mixed, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

approvalHistorySchema.index({ propertyId: 1, createdAt: -1 });
approvalHistorySchema.index({ actorId: 1, createdAt: -1 });

export const ApprovalHistory = mongoose.models.ApprovalHistory
  || mongoose.model('ApprovalHistory', approvalHistorySchema);
