import { EVENT_TYPES } from '../../shared/constants/index.js';
import { eventBus } from '../../infrastructure/events/index.js';
import { mediaService } from './media.service.js';

let registered = false;

export function registerMediaHandlers() {
  if (registered) return;
  registered = true;

  eventBus.subscribe(EVENT_TYPES.MEDIA_CLEANUP_REQUESTED, async (event) => {
    const mediaId = event?.payload?.mediaId;
    if (!mediaId) return;
    await mediaService.cleanup(mediaId);
  });
}
