import mongoose from 'mongoose';

export const AUDIT_ENTITY_TYPES = Object.freeze([
  'property',
  'booking',
  'user',
  'category',
  'amenity',
  'deletionRequest',
  'settings',
  'changeRequest'
]);

const auditLogSchema = new mongoose.Schema({
  actorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  actorRole: { type: String, required: true, trim: true },
  action: { type: String, required: true, trim: true },
  entityType: {
    type: String,
    enum: AUDIT_ENTITY_TYPES,
    required: true
  },
  entityId: { type: mongoose.Schema.Types.Mixed, required: true },
  before: { type: mongoose.Schema.Types.Mixed, default: null },
  after: { type: mongoose.Schema.Types.Mixed, default: null },
  changeSummary: {
    type: [{
      field: { type: String, required: true },
      before: { type: mongoose.Schema.Types.Mixed, default: null },
      after: { type: mongoose.Schema.Types.Mixed, default: null }
    }],
    default: []
  },
  reason: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: { createdAt: true, updatedAt: false } });

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
auditLogSchema.index({ createdAt: -1 });

auditLogSchema.set('toJSON', {
  transform(_doc, ret) {
    ret.id = String(ret._id);
    delete ret.__v;
    return ret;
  }
});

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
