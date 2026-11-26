import { registerNotificationHandlers } from '../../modules/notifications/notification.events.js';
import { registerMediaHandlers } from '../../modules/media/media.events.js';
import { registerAuditHandlers } from '../../modules/auditLogs/audit.events.js';

let registered = false;

export function registerInfrastructureHandlers() {
  if (registered) return;
  registered = true;
  registerNotificationHandlers();
  registerMediaHandlers();
  registerAuditHandlers();
}
