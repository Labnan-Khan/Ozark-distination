import mongoose from 'mongoose';
import { ACCOUNT_STATUS, EVENT_TYPES, ROLES } from '../../shared/constants/index.js';
import { emailProvider, renderEmail } from '../../infrastructure/email/index.js';
import { eventBus } from '../../infrastructure/events/index.js';
import { jobQueue } from '../../infrastructure/jobs/index.js';
import { User } from '../users/user.model.js';
import { notificationsService } from './notification.service.js';

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== '');
const asText = (value, fallback = '') => (value === undefined || value === null || value === '' ? fallback : String(value));

const bookingLabel = ({ payload }) => asText(
  first(payload.reference, payload.bookingReference, payload.bookingId),
  'your booking'
);
const propertyLabel = ({ payload }) => asText(
  first(payload.propertyTitle, payload.title, payload.propertyId),
  'your property'
);
const reasonText = ({ payload }) => asText(payload.reason, 'No reason provided');

const NOTIFICATION_TEMPLATES = Object.freeze({
  [EVENT_TYPES.BOOKING_REQUESTED]: {
    owner: {
      type: 'BookingRequested',
      title: 'New booking request',
      body: (context) => `A new booking request ${bookingLabel(context)} is awaiting your review.`,
      priority: 'high'
    },
    customer: {
      type: 'BookingRequested',
      title: 'Booking request received',
      body: (context) => `Your booking request ${bookingLabel(context)} has been received.`
    }
  },
  [EVENT_TYPES.BOOKING_CONFIRMED]: {
    customer: {
      type: 'BookingConfirmed',
      title: 'Booking confirmed',
      body: (context) => `Your booking ${bookingLabel(context)} has been confirmed.`
    },
    owner: {
      type: 'BookingConfirmed',
      title: 'Booking confirmed',
      body: (context) => `A booking ${bookingLabel(context)} was confirmed.`
    }
  },
  [EVENT_TYPES.BOOKING_REJECTED]: {
    customer: {
      type: 'BookingRejected',
      title: 'Booking rejected',
      body: (context) => `Your booking ${bookingLabel(context)} was rejected. Reason: ${reasonText(context)}`
    },
    owner: {
      type: 'BookingRejected',
      title: 'Booking rejected',
      body: (context) => `You rejected booking ${bookingLabel(context)}.`
    }
  },
  [EVENT_TYPES.BOOKING_CANCELLED]: {
    customer: {
      type: 'BookingCancelled',
      title: 'Booking cancelled',
      body: (context) => `Your booking ${bookingLabel(context)} has been cancelled.`
    },
    owner: {
      type: 'BookingCancelled',
      title: 'Booking cancelled',
      body: (context) => `Booking ${bookingLabel(context)} has been cancelled.`
    }
  },
  [EVENT_TYPES.CANCELLATION_REQUESTED]: {
    customer: {
      type: 'CancellationRequested',
      title: 'Cancellation requested',
      body: (context) => `Your cancellation request for ${bookingLabel(context)} was received.`
    },
    owner: {
      type: 'CancellationRequested',
      title: 'Cancellation requested',
      body: (context) => `A customer requested cancellation for ${bookingLabel(context)}.`,
      priority: 'high'
    }
  },
  [EVENT_TYPES.CANCELLATION_RESOLVED]: {
    customer: {
      type: 'CancellationResolved',
      title: (context) => context.payload.decision === 'approve' ? 'Cancellation approved' : 'Cancellation rejected',
      body: (context) => `Your cancellation request for ${bookingLabel(context)} was ${context.payload.decision === 'approve' ? 'approved' : 'rejected'}.`
    },
    owner: {
      type: 'CancellationResolved',
      title: (context) => context.payload.decision === 'approve' ? 'Cancellation approved' : 'Cancellation rejected',
      body: (context) => `The cancellation request for ${bookingLabel(context)} was ${context.payload.decision === 'approve' ? 'approved' : 'rejected'}.`
    }
  },
  [EVENT_TYPES.BOOKING_MODIFIED]: {
    customer: {
      type: 'BookingModified',
      title: 'Booking dates updated',
      body: (context) => `The dates for booking ${bookingLabel(context)} were updated by an administrator.`
    },
    owner: {
      type: 'BookingModified',
      title: 'Booking dates updated',
      body: (context) => `The dates for booking ${bookingLabel(context)} were updated by an administrator.`
    }
  },
  [EVENT_TYPES.BOOKING_REMINDER]: {
    customer: {
      type: 'BookingReminder',
      title: 'Upcoming booking',
      body: (context) => `Reminder: your booking ${bookingLabel(context)} at ${propertyLabel(context)} is coming up.`
    },
    owner: {
      type: 'BookingReminder',
      title: 'Upcoming booking',
      body: (context) => `Reminder: booking ${bookingLabel(context)} at ${propertyLabel(context)} is coming up.`
    }
  },
  [EVENT_TYPES.PROPERTY_SUBMITTED]: {
    owner: {
      type: 'PropertySubmitted',
      title: 'Property submitted',
      body: (context) => `Your property "${propertyLabel(context)}" was submitted for review.`
    },
    admin: {
      type: 'PropertySubmitted',
      title: 'New property submitted',
      body: (context) => `Property "${propertyLabel(context)}" is awaiting review.`
    }
  },
  [EVENT_TYPES.PROPERTY_APPROVED]: {
    owner: {
      type: 'PropertyApproved',
      title: 'Property approved',
      body: (context) => `Your property "${propertyLabel(context)}" has been approved.`
    }
  },
  [EVENT_TYPES.PROPERTY_REJECTED]: {
    owner: {
      type: 'PropertyRejected',
      title: 'Property rejected',
      body: (context) => `Your property "${propertyLabel(context)}" was rejected. Reason: ${reasonText(context)}`
    }
  },
  [EVENT_TYPES.PROPERTY_LIFECYCLE_REQUESTED]: {
    owner: {
      type: 'PropertyLifecycleRequested',
      title: 'Property request received',
      body: (context) => `Your ${asText(context.payload.action, 'lifecycle')} request for "${propertyLabel(context)}" was received.`
    },
    admin: {
      type: 'PropertyLifecycleRequested',
      title: 'New property lifecycle request',
      body: (context) => `A ${asText(context.payload.action, 'lifecycle')} request for "${propertyLabel(context)}" is awaiting review.`,
      priority: 'high'
    }
  },
  [EVENT_TYPES.PROPERTY_LIFECYCLE_RESOLVED]: {
    owner: {
      type: 'PropertyLifecycleResolved',
      title: (context) => context.payload.status === 'approved' ? 'Property request approved' : 'Property request rejected',
      body: (context) => `Your ${asText(context.payload.action, 'lifecycle')} request for "${propertyLabel(context)}" was ${asText(context.payload.status, 'resolved')}.`
    }
  },
  [EVENT_TYPES.PROPERTY_DELETED]: {
    owner: {
      type: 'PropertyDeleted',
      title: 'Property deleted',
      body: (context) => `Your property "${propertyLabel(context)}" was deleted.${context.payload.reason ? ` Reason: ${reasonText(context)}` : ''}`
    }
  },
  [EVENT_TYPES.ACCOUNT_DELETION_REQUESTED]: {
    user: {
      type: 'AccountDeletionRequested',
      title: 'Account deletion requested',
      body: () => 'We received your account deletion request.',
      priority: 'high'
    }
  },
  [EVENT_TYPES.ACCOUNT_DELETION_RESOLVED]: {
    user: {
      type: 'System',
      title: 'Account deletion update',
      body: (context) => `Your account deletion request is now ${asText(context.payload.status, 'resolved')}.`,
      priority: 'high'
    }
  },
  [EVENT_TYPES.USER_REGISTERED]: {
    user: {
      type: 'System',
      title: 'Welcome',
      body: (context) => `Hi ${asText(first(context.payload.fullName, context.actor?.fullName), 'there')}, welcome to our property rental platform.`
    }
  }
});

function render(template, context) {
  return typeof template === 'function' ? template(context) : template;
}

async function recipientIdsFor(event, roles) {
  const payload = event.payload || {};
  const direct = {
    owner: first(payload.ownerId, payload.owner?._id, payload.owner?.id),
    customer: first(payload.customerId, payload.customer?._id, payload.customer?.id),
    user: first(payload.userId, payload.user?._id, payload.user?.id, event.actor?.userId)
  };

  const recipients = [];
  for (const role of roles) {
    if (role === 'admin') {
      const admins = await User.find({
        roles: ROLES.ADMIN,
        accountStatus: ACCOUNT_STATUS.ACTIVE,
        deletedAt: null
      }).select('_id').lean();
      recipients.push(...admins.map((admin) => ({ role, userId: admin._id })));
      continue;
    }
    if (direct[role]) recipients.push({ role, userId: direct[role] });
  }

  const seen = new Set();
  return recipients.filter(({ userId }) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) return false;
    const key = String(userId);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((recipient) => ({ ...recipient, userId: String(recipient.userId) }));
}

function notificationData(event, eventKey) {
  const payload = event.payload || {};
  const data = {
    eventId: eventKey || null,
    bookingId: first(payload.bookingId, payload.booking?._id) || undefined,
    propertyId: first(payload.propertyId, payload.property?._id) || undefined,
    actorId: first(event.actor?.userId, payload.actorId, payload.actor?._id) || undefined
  };
  return Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
}

async function createNotifications(event) {
  const templates = NOTIFICATION_TEMPLATES[event.type];
  if (!templates) return;

  const eventKey = event.eventId || event.idempotencyKey || null;
  const context = { event, payload: event.payload || {}, actor: event.actor || {} };
  const recipients = await recipientIdsFor(event, Object.keys(templates));

  for (const { role, userId } of recipients) {
    const template = templates[role];
    if (!template) continue;
    await notificationsService.createInApp({
      userId,
      type: template.type,
      title: render(template.title, context),
      body: render(template.body, context),
      data: notificationData(event, eventKey),
      priority: template.priority || 'normal',
      eventId: eventKey
    });
  }
  await sendEventEmails(event, recipients);
}

const EMAIL_TEMPLATES = Object.freeze({
  [EVENT_TYPES.BOOKING_REQUESTED]: 'bookingRequested',
  [EVENT_TYPES.BOOKING_CONFIRMED]: 'bookingConfirmed',
  [EVENT_TYPES.BOOKING_REJECTED]: 'bookingRejected',
  [EVENT_TYPES.CANCELLATION_REQUESTED]: 'cancellationRequested',
  [EVENT_TYPES.BOOKING_CANCELLED]: 'bookingCancelled',
  [EVENT_TYPES.BOOKING_REMINDER]: 'bookingReminder',
  [EVENT_TYPES.PROPERTY_APPROVED]: 'propertyApproved',
  [EVENT_TYPES.PROPERTY_REJECTED]: 'propertyRejected',
  [EVENT_TYPES.PROPERTY_LIFECYCLE_REQUESTED]: 'propertyLifecycleRequested',
  [EVENT_TYPES.PROPERTY_LIFECYCLE_RESOLVED]: 'propertyLifecycleResolved',
  [EVENT_TYPES.PROPERTY_DELETED]: 'propertyDeleted',
  [EVENT_TYPES.ACCOUNT_DELETION_REQUESTED]: 'accountDeletion',
  [EVENT_TYPES.ACCOUNT_DELETION_RESOLVED]: 'accountDeletion'
});

function emailData(event, role) {
  const payload = event.payload || {};
  const reference = first(payload.reference, payload.bookingId);
  const title = first(payload.title, payload.propertyTitle, payload.propertyId);
  return {
    reference: reference ? String(reference) : 'your booking',
    title: title ? String(title) : 'your property',
    checkIn: first(payload.checkIn, payload.checkInDate) || null,
    reason: payload.reason || null,
    action: payload.action || null,
    status: payload.status || (
      event.type === EVENT_TYPES.ACCOUNT_DELETION_REQUESTED || event.type === EVENT_TYPES.PROPERTY_LIFECYCLE_REQUESTED
        ? 'requested'
        : 'resolved'
    )
  };
}

async function sendEventEmails(event, recipients) {
  const templateName = EMAIL_TEMPLATES[event.type];
  if (!templateName || !recipients.length) return;

  const ids = [...new Set(recipients.map((recipient) => recipient.userId))];
  const users = await User.find({ _id: { $in: ids } }).select('email').lean();
  const emailById = new Map(users.map((user) => [String(user._id), user.email]));
  const eventKey = event.eventId || event.idempotencyKey || event.type;

  for (const { userId } of recipients) {
    const to = emailById.get(String(userId));
    if (!to) continue;
    await jobQueue.sendEmail(
      { to, ...renderEmail(templateName, emailData(event)) },
      { idempotencyKey: `email:${eventKey}:${userId}` }
    );
  }
}

let registered = false;

export function registerNotificationHandlers() {
  if (registered) return;
  registered = true;

  for (const type of Object.keys(NOTIFICATION_TEMPLATES)) {
    eventBus.subscribe(type, createNotifications);
  }

  eventBus.subscribe(EVENT_TYPES.SEND_EMAIL, async (event) => {
    await emailProvider.send(event.payload || {});
  });
}
