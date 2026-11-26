export const ROLES = Object.freeze({
  CUSTOMER: 'customer',
  OWNER: 'owner',
  ADMIN: 'admin'
});

export const ACCOUNT_STATUS = Object.freeze({
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  DEACTIVATED: 'deactivated',
  PENDING_DELETION: 'pending_deletion',
  DELETED: 'deleted'
});

export const LISTING_STATUS = Object.freeze({
  DRAFT: 'draft',
  PUBLISHED: 'published',
  ARCHIVED: 'archived'
});

export const APPROVAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
});

export const AVAILABILITY_STATUS = Object.freeze({
  AVAILABLE: 'available',
  BOOKED: 'booked',
  UNAVAILABLE: 'unavailable'
});

export const BOOKING_STATUS = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  REJECTED: 'rejected',
  CANCELLATION_REQUESTED: 'cancellation_requested',
  CANCELLED: 'cancelled',
  COMPLETED: 'completed',
  EXPIRED: 'expired'
});

export const BOOKING_MODES = Object.freeze({
  INSTANT: 'instant',
  REQUEST: 'request'
});

export const RENTAL_PERIODS = Object.freeze({
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
  CUSTOM: 'custom'
});

export const CATEGORY_GROUPS = Object.freeze({
  RESIDENTIAL: 'residential',
  COMMERCIAL: 'commercial',
  HOSPITALITY: 'hospitality',
  INDUSTRIAL: 'industrial',
  LAND: 'land',
  OTHER: 'other'
});

export const ATTRIBUTE_TYPES = Object.freeze({
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  ENUM: 'enum',
  MULTI_ENUM: 'multiEnum',
  DATE: 'date'
});

export const MEDIA_RESOURCE_TYPES = Object.freeze({
  IMAGE: 'image',
  VIDEO: 'video',
  FLOORPLAN: 'floorplan',
  DOCUMENT: 'document',
  TOUR: 'tour',
  PANORAMA: '360'
});

export const RESERVATION_SOURCES = Object.freeze({
  BOOKING: 'booking',
  OWNER_BLOCK: 'owner_block',
  MAINTENANCE: 'maintenance'
});

export const PAYMENT_STATUS = Object.freeze({
  NOT_APPLICABLE: 'not_applicable',
  PENDING: 'pending',
  PAID: 'paid',
  REFUNDED: 'refunded'
});

export const EVENT_TYPES = Object.freeze({
  USER_REGISTERED: 'UserRegistered',
  PASSWORD_RESET_REQUESTED: 'PasswordResetRequested',
  PASSWORD_CHANGED: 'PasswordChanged',
  ACCOUNT_DELETION_REQUESTED: 'AccountDeletionRequested',
  ACCOUNT_DELETION_RESOLVED: 'AccountDeletionResolved',
  USER_SUSPENDED: 'UserSuspended',
  PROPERTY_SUBMITTED: 'PropertySubmitted',
  PROPERTY_APPROVED: 'PropertyApproved',
  PROPERTY_REJECTED: 'PropertyRejected',
  PROPERTY_UPDATED: 'PropertyUpdated',
  PROPERTY_ARCHIVED: 'PropertyArchived',
  PROPERTY_DELETED: 'PropertyDeleted',
  PROPERTY_LIFECYCLE_REQUESTED: 'PropertyLifecycleRequested',
  PROPERTY_LIFECYCLE_RESOLVED: 'PropertyLifecycleResolved',
  DUPLICATE_FLAGGED: 'DuplicateFlagged',
  BOOKING_REQUESTED: 'BookingRequested',
  BOOKING_CONFIRMED: 'BookingConfirmed',
  BOOKING_REJECTED: 'BookingRejected',
  CANCELLATION_REQUESTED: 'CancellationRequested',
  CANCELLATION_RESOLVED: 'CancellationResolved',
  BOOKING_CANCELLED: 'BookingCancelled',
  BOOKING_COMPLETED: 'BookingCompleted',
  BOOKING_MODIFIED: 'BookingModified',
  BOOKING_REMINDER: 'BookingReminder',
  NOTIFICATION_CREATED: 'NotificationCreated',
  SEND_EMAIL: 'SendEmail',
  MEDIA_CLEANUP_REQUESTED: 'MediaCleanupRequested',
  ADMIN_CREATED: 'AdminCreated',
  SETTINGS_CHANGED: 'SettingsChanged',
  CATEGORY_CHANGED: 'CategoryChanged',
  AMENITY_CHANGED: 'AmenityChanged'
});

export const PERMISSIONS = Object.freeze({
  USER_READ_OWN: 'user.read.own',
  USER_UPDATE_OWN: 'user.update.own',
  USER_DELETE_REQUEST: 'user.delete.request',
  USER_READ_ANY: 'user.read.any',
  USER_SUSPEND_ANY: 'user.suspend.any',
  USER_DELETE_ANY: 'user.delete.any',
  ADMIN_CREATE: 'admin.create',
  DELETION_REVIEW_ANY: 'deletionRequest.review.any',
  CATEGORY_READ: 'category.read',
  CATEGORY_MANAGE: 'category.manage',
  AMENITY_READ: 'amenity.read',
  AMENITY_MANAGE: 'amenity.manage',
  PROPERTY_READ_OWN: 'property.read.own',
  PROPERTY_READ_ANY: 'property.read.any',
  PROPERTY_CREATE_OWN: 'property.create.own',
  PROPERTY_CREATE_ANY: 'property.create.any',
  PROPERTY_UPDATE_OWN: 'property.update.own',
  PROPERTY_UPDATE_ANY: 'property.update.any',
  PROPERTY_SUBMIT: 'property.submit',
  PROPERTY_PUBLISH: 'property.publish',
  PROPERTY_ARCHIVE_OWN: 'property.archive.own',
  PROPERTY_ARCHIVE_ANY: 'property.archive.any',
  PROPERTY_DELETE_ANY: 'property.delete.any',
  PROPERTY_LIFECYCLE_REQUEST_OWN: 'property.lifecycleRequest.own',
  PROPERTY_LIFECYCLE_REVIEW_ANY: 'property.lifecycleRequest.review.any',
  PROPERTY_APPROVE_ANY: 'property.approve.any',
  CHANGE_REQUEST_READ_OWN: 'propertyChangeRequest.read.own',
  CHANGE_REQUEST_REVIEW_ANY: 'propertyChangeRequest.review.any',
  DUPLICATE_REVIEW_ANY: 'duplicateFlag.review.any',
  MEDIA_MANAGE_OWN: 'media.manage.own',
  MEDIA_MANAGE_ANY: 'media.manage.any',
  AVAILABILITY_MANAGE_OWN: 'availability.manage.own',
  AVAILABILITY_MANAGE_ANY: 'availability.manage.any',
  BOOKING_CREATE_OWN: 'booking.create.own',
  BOOKING_CREATE_ANY: 'booking.create.any',
  BOOKING_READ_OWN: 'booking.read.own',
  BOOKING_READ_OWN_PROPERTY: 'booking.read.ownProperty',
  BOOKING_READ_ANY: 'booking.read.any',
  BOOKING_APPROVE_OWN_PROPERTY: 'booking.approve.ownProperty',
  BOOKING_APPROVE_ANY: 'booking.approve.any',
  BOOKING_CANCEL_OWN: 'booking.cancel.own',
  BOOKING_CANCEL_OWN_PROPERTY: 'booking.cancel.ownProperty',
  BOOKING_CANCEL_ANY: 'booking.cancel.any',
  BOOKING_COMPLETE_OWN_PROPERTY: 'booking.complete.ownProperty',
  BOOKING_COMPLETE_ANY: 'booking.complete.any',
  BOOKING_MODIFY_ANY: 'booking.modify.any',
  FAVORITE_MANAGE_OWN: 'favorite.manage.own',
  NOTIFICATION_READ_OWN: 'notification.read.own',
  SETTINGS_READ: 'settings.read',
  SETTINGS_MANAGE: 'settings.manage',
  AUDIT_READ: 'auditLog.read',
  REPORT_READ: 'report.read'
});

export const ROLE_PERMISSIONS = Object.freeze({
  [ROLES.CUSTOMER]: [
    PERMISSIONS.USER_READ_OWN,
    PERMISSIONS.USER_UPDATE_OWN,
    PERMISSIONS.USER_DELETE_REQUEST,
    PERMISSIONS.BOOKING_CREATE_OWN,
    PERMISSIONS.BOOKING_READ_OWN,
    PERMISSIONS.BOOKING_CANCEL_OWN,
    PERMISSIONS.FAVORITE_MANAGE_OWN,
    PERMISSIONS.MEDIA_MANAGE_OWN,
    PERMISSIONS.NOTIFICATION_READ_OWN
  ],
  [ROLES.OWNER]: [
    PERMISSIONS.USER_READ_OWN,
    PERMISSIONS.USER_UPDATE_OWN,
    PERMISSIONS.USER_DELETE_REQUEST,
    PERMISSIONS.PROPERTY_READ_OWN,
    PERMISSIONS.PROPERTY_CREATE_OWN,
    PERMISSIONS.PROPERTY_UPDATE_OWN,
    PERMISSIONS.PROPERTY_SUBMIT,
    PERMISSIONS.PROPERTY_PUBLISH,
    PERMISSIONS.PROPERTY_ARCHIVE_OWN,
    PERMISSIONS.PROPERTY_LIFECYCLE_REQUEST_OWN,
    PERMISSIONS.CHANGE_REQUEST_READ_OWN,
    PERMISSIONS.MEDIA_MANAGE_OWN,
    PERMISSIONS.AVAILABILITY_MANAGE_OWN,
    PERMISSIONS.BOOKING_READ_OWN_PROPERTY,
    PERMISSIONS.BOOKING_APPROVE_OWN_PROPERTY,
    PERMISSIONS.BOOKING_CANCEL_OWN_PROPERTY,
    PERMISSIONS.BOOKING_COMPLETE_OWN_PROPERTY,
    PERMISSIONS.NOTIFICATION_READ_OWN
  ],
  [ROLES.ADMIN]: Object.values(PERMISSIONS)
});

export const BOOKING_TRANSITIONS = Object.freeze({
  [BOOKING_STATUS.PENDING]: [BOOKING_STATUS.CONFIRMED, BOOKING_STATUS.REJECTED, BOOKING_STATUS.EXPIRED, BOOKING_STATUS.CANCELLED],
  [BOOKING_STATUS.CONFIRMED]: [BOOKING_STATUS.CANCELLATION_REQUESTED, BOOKING_STATUS.CANCELLED, BOOKING_STATUS.COMPLETED],
  [BOOKING_STATUS.CANCELLATION_REQUESTED]: [BOOKING_STATUS.CANCELLED, BOOKING_STATUS.CONFIRMED],
  [BOOKING_STATUS.REJECTED]: [],
  [BOOKING_STATUS.CANCELLED]: [],
  [BOOKING_STATUS.COMPLETED]: [],
  [BOOKING_STATUS.EXPIRED]: []
});

export const ALLOWED_ROLES = Object.values(ROLES);
