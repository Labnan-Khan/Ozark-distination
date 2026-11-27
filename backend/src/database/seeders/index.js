import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { env } from '../../config/environment.js';
import { appConfig } from '../../config/appConfig.js';
import { logger } from '../../infrastructure/logging/index.js';
import { ROLES, CATEGORY_GROUPS, RENTAL_PERIODS, ATTRIBUTE_TYPES } from '../../shared/constants/index.js';
import { User } from '../../modules/users/user.model.js';
import { PropertyCategory } from '../../modules/categories/propertyCategory.model.js';
import { Amenity } from '../../modules/amenities/amenity.model.js';
import { Setting } from '../../modules/admin/setting.model.js';

const attribute = (key, label, dataType, extra = {}) => ({
  key, label, dataType, required: false, unit: null, options: [],
  min: null, max: null, minLength: null, maxLength: null, pattern: null,
  defaultValue: null, searchable: true, filterable: true, displayOrder: 0,
  deprecated: false, description: null, ...extra
});

const categories = [
  { code: 'campsite', name: 'Campsite', group: CATEGORY_GROUPS.HOSPITALITY, sortOrder: 1, periods: ['daily', 'weekly', 'monthly'], attributes: [attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER), attribute('tentSites', 'Tent sites', ATTRIBUTE_TYPES.INTEGER), attribute('hasFirePit', 'Fire pit', ATTRIBUTE_TYPES.BOOLEAN), attribute('hasRestrooms', 'Restrooms', ATTRIBUTE_TYPES.BOOLEAN), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'rv_hookup_site', name: 'RV Hookup Site', group: CATEGORY_GROUPS.OTHER, sortOrder: 2, periods: ['daily', 'weekly', 'monthly', 'yearly'], attributes: [attribute('hookupType', 'Hookup type', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'electric', label: 'Electric' }, { value: 'water', label: 'Water' }, { value: 'full', label: 'Full hookup' }] }), attribute('maxRvLength', 'Maximum RV length', ATTRIBUTE_TYPES.NUMBER, { unit: 'ft' }), attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'house', name: 'House', group: CATEGORY_GROUPS.RESIDENTIAL, sortOrder: 3, periods: ['daily', 'weekly', 'monthly', 'yearly'], attributes: [attribute('bedrooms', 'Bedrooms', ATTRIBUTE_TYPES.INTEGER, { required: true, min: 1 }), attribute('bathrooms', 'Bathrooms', ATTRIBUTE_TYPES.INTEGER), attribute('floors', 'Floors', ATTRIBUTE_TYPES.INTEGER), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER), attribute('furnishing', 'Furnishing status', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'unfurnished', label: 'Unfurnished' }, { value: 'semi', label: 'Semi-furnished' }, { value: 'furnished', label: 'Furnished' }] })] },
  { code: 'boat_house', name: 'Boat house', group: CATEGORY_GROUPS.HOSPITALITY, sortOrder: 4, periods: ['daily', 'weekly', 'monthly', 'yearly'], attributes: [attribute('bedrooms', 'Bedrooms', ATTRIBUTE_TYPES.INTEGER), attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER), attribute('dockAccess', 'Dock access', ATTRIBUTE_TYPES.BOOLEAN), attribute('boatLength', 'Boat length', ATTRIBUTE_TYPES.NUMBER, { unit: 'ft' }), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'venue', name: 'Venue', group: CATEGORY_GROUPS.COMMERCIAL, sortOrder: 5, periods: ['daily', 'weekly', 'monthly', 'yearly'], attributes: [attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER, { required: true }), attribute('area', 'Area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' }), attribute('eventType', 'Event type', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'wedding', label: 'Wedding' }, { value: 'corporate', label: 'Corporate' }, { value: 'party', label: 'Party' }, { value: 'other', label: 'Other' }] }), attribute('indoor', 'Indoor', ATTRIBUTE_TYPES.BOOLEAN), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'condominium', name: 'Condominium', group: CATEGORY_GROUPS.RESIDENTIAL, sortOrder: 6, periods: ['daily', 'monthly', 'yearly'], attributes: [attribute('bedrooms', 'Bedrooms', ATTRIBUTE_TYPES.INTEGER, { required: true }), attribute('bathrooms', 'Bathrooms', ATTRIBUTE_TYPES.INTEGER), attribute('floorNumber', 'Floor number', ATTRIBUTE_TYPES.INTEGER), attribute('furnishing', 'Furnishing status', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'unfurnished', label: 'Unfurnished' }, { value: 'furnished', label: 'Furnished' }] }), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER)] }
];

const amenities = ['wifi', 'parking', 'air_conditioning', 'swimming_pool', 'security', 'elevator', 'furnished', 'garden', 'gym'];

const settings = [
  { key: 'maxImagesPerProperty', value: appConfig.defaults.maxImagesPerProperty, description: 'Maximum images per property listing' },
  { key: 'defaultCurrency', value: appConfig.defaults.currency, description: 'Default ISO-4217 currency for new listings' },
  { key: 'leadTimeDays', value: appConfig.defaults.leadTimeDays, description: 'Minimum days between now and check-in' },
  { key: 'maxAdvanceDays', value: appConfig.defaults.maxAdvanceDays, description: 'Maximum days in advance a booking may be made' },
  { key: 'loginRateMax', value: appConfig.security.loginRateMax, description: 'Login attempts allowed per window' },
  { key: 'featureFlags', value: { emailVerification: false, onlinePayments: false }, description: 'Feature flags' }
];

export async function seedDatabase() {
  let admin = await User.findOne({ email: env.SEED_ADMIN_EMAIL || 'admin@example.com' });
  if (!admin) {
    admin = await User.create({
      roles: [ROLES.ADMIN],
      fullName: env.SEED_ADMIN_NAME || 'Platform Admin',
      email: env.SEED_ADMIN_EMAIL || 'admin@example.com',
      passwordHash: await bcrypt.hash(env.SEED_ADMIN_PASSWORD || 'ChangeMe123456!', appConfig.security.bcryptRounds)
    });
    logger.info({ adminId: String(admin._id) }, 'seed admin created');
  }

  for (const item of categories) {
    await PropertyCategory.updateOne(
      { code: item.code },
      {
        $set: {
          name: item.name,
          group: item.group,
          isActive: true,
          sortOrder: item.sortOrder,
          allowedRentalPeriods: item.periods,
          attributeSchema: item.attributes,
          createdBy: admin._id
        },
        $setOnInsert: { code: item.code, attributeSchemaVersion: 1 }
      },
      { upsert: true }
    );
  }

  await PropertyCategory.updateMany(
    { code: { $nin: categories.map((item) => item.code) }, isActive: true },
    { $set: { isActive: false } }
  );

  for (const code of amenities) {
    await Amenity.updateOne(
      { code },
      { $set: { name: code.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()), isActive: true, createdBy: admin._id } },
      { upsert: true }
    );
  }

  for (const setting of settings) {
    await Setting.updateOne({ key: setting.key }, { $set: setting }, { upsert: true });
  }

  logger.info({ categories: categories.length, amenities: amenities.length, settings: settings.length }, 'seed completed');
}

if (process.argv[1]?.endsWith('seeders/index.js') || process.argv[1]?.endsWith('seeders')) {
  connectDatabase()
    .then(seedDatabase)
    .then(disconnectDatabase)
    .catch(async (error) => {
      logger.fatal({ err: error }, 'seed failed');
      await disconnectDatabase();
      process.exit(1);
    });
}
