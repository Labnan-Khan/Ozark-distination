import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { logger } from '../../infrastructure/logging/index.js';
import { User } from '../../modules/users/user.model.js';
import { Session, PasswordResetToken } from '../../modules/auth/auth.model.js';
import { PropertyCategory } from '../../modules/categories/propertyCategory.model.js';
import { Amenity } from '../../modules/amenities/amenity.model.js';
import { Property } from '../../modules/properties/property.model.js';
import { ApprovalHistory } from '../../modules/properties/approvalHistory.model.js';
import { ChangeRequest } from '../../modules/properties/changeRequest.model.js';
import { DuplicateFlag } from '../../modules/properties/duplicateFlag.model.js';
import { PropertyLifecycleRequest } from '../../modules/properties/propertyLifecycleRequest.model.js';
import { Media } from '../../modules/media/media.model.js';
import { Booking } from '../../modules/bookings/booking.model.js';
import { AvailabilityReservation } from '../../modules/bookings/reservation.model.js';
import { BookingHistory } from '../../modules/bookings/bookingHistory.model.js';
import { Favorite } from '../../modules/favorites/favorite.model.js';
import { Notification } from '../../modules/notifications/notification.model.js';
import { DeletionRequest } from '../../modules/users/deletionRequest.model.js';
import { AuditLog } from '../../modules/auditLogs/auditLog.model.js';
import { Setting } from '../../modules/admin/setting.model.js';
import { EventOutbox } from '../../infrastructure/events/outbox.model.js';

const models = [
  User,
  Session,
  PasswordResetToken,
  PropertyCategory,
  Amenity,
  Property,
  ApprovalHistory,
  ChangeRequest,
  DuplicateFlag,
  PropertyLifecycleRequest,
  Media,
  Booking,
  AvailabilityReservation,
  BookingHistory,
  Favorite,
  Notification,
  DeletionRequest,
  AuditLog,
  Setting,
  EventOutbox
];

export async function ensureIndexes() {
  await Promise.all(models.map((model) => model.createIndexes()));
  logger.info({ count: models.length }, 'MongoDB indexes ensured');
}

if (process.argv[1]?.endsWith('index.js')) {
  connectDatabase()
    .then(ensureIndexes)
    .then(disconnectDatabase)
    .catch(async (error) => {
      logger.fatal({ err: error }, 'index creation failed');
      await disconnectDatabase();
      process.exit(1);
    });
}
