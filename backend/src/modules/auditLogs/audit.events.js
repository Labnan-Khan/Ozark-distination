import { eventBus } from '../../infrastructure/events/index.js';
import { auditService } from './audit.service.js';

export const AUDIT_RECORDED_EVENT = 'AuditRecorded';

let registered = false;

export function registerAuditHandlers() {
  if (registered) return;
  registered = true;

  eventBus.subscribe(AUDIT_RECORDED_EVENT, async (event) => {
    const payload = event.payload || {};
    await auditService.record({
      actor: payload.actor || event.actor,
      action: payload.action,
      entityType: payload.entityType,
      entityId: payload.entityId,
      before: payload.before,
      after: payload.after,
      changeSummary: payload.changeSummary,
      reason: payload.reason,
      metadata: {
        ...(payload.metadata || {}),
        ...(event.eventId ? { eventId: event.eventId } : {})
      }
    }, event);
  });
}
