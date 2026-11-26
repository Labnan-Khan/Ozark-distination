import { ROLES } from '../../shared/constants/index.js';
import { forbidden } from '../../shared/errors/index.js';

export const policyService = {
  canCustomerRequestCancellation(booking) {
    return ['confirmed', 'pending'].includes(booking.status);
  },

  /**
   * V1 default: customers request cancellation for owner/admin review; owners may
   * cancel bookings for their own property; admins may cancel any booking.
   */
  assertDirectCancellation(actor, booking) {
    const roles = Array.isArray(actor.roles) ? actor.roles : [actor.roles];
    if (roles.includes(ROLES.ADMIN)) return true;
    if (roles.includes(ROLES.OWNER) && String(booking.ownerId) === String(actor._id)) return true;
    throw forbidden('Cancellation policy does not allow this action');
  }
};
