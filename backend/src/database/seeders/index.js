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
  { code: 'house', name: 'House', group: CATEGORY_GROUPS.RESIDENTIAL, periods: ['daily', 'monthly', 'yearly'], attributes: [attribute('bedrooms', 'Bedrooms', ATTRIBUTE_TYPES.INTEGER, { required: true, min: 1 }), attribute('bathrooms', 'Bathrooms', ATTRIBUTE_TYPES.INTEGER), attribute('floors', 'Floors', ATTRIBUTE_TYPES.INTEGER), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER), attribute('furnishing', 'Furnishing status', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'unfurnished', label: 'Unfurnished' }, { value: 'semi', label: 'Semi-furnished' }, { value: 'furnished', label: 'Furnished' }] })] },
  { code: 'apartment', name: 'Apartment', group: CATEGORY_GROUPS.RESIDENTIAL, periods: ['daily', 'monthly', 'yearly'], attributes: [attribute('bedrooms', 'Bedrooms', ATTRIBUTE_TYPES.INTEGER, { required: true }), attribute('bathrooms', 'Bathrooms', ATTRIBUTE_TYPES.INTEGER), attribute('floorNumber', 'Floor number', ATTRIBUTE_TYPES.INTEGER), attribute('furnishing', 'Furnishing status', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'unfurnished', label: 'Unfurnished' }, { value: 'furnished', label: 'Furnished' }] })] },
  { code: 'villa', name: 'Villa', group: CATEGORY_GROUPS.RESIDENTIAL, periods: ['daily', 'monthly', 'yearly'], attributes: [attribute('bedrooms', 'Bedrooms', ATTRIBUTE_TYPES.INTEGER), attribute('bathrooms', 'Bathrooms', ATTRIBUTE_TYPES.INTEGER), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'room', name: 'Room', group: CATEGORY_GROUPS.RESIDENTIAL, periods: ['daily', 'weekly', 'monthly'], attributes: [attribute('bedCount', 'Bed count', ATTRIBUTE_TYPES.INTEGER), attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'office', name: 'Office', group: CATEGORY_GROUPS.COMMERCIAL, periods: ['monthly', 'yearly'], attributes: [attribute('floorNumber', 'Floor number', ATTRIBUTE_TYPES.INTEGER), attribute('officeArea', 'Office area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' }), attribute('meetingRooms', 'Meeting rooms', ATTRIBUTE_TYPES.INTEGER), attribute('parkingSpaces', 'Parking spaces', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'shop', name: 'Shop', group: CATEGORY_GROUPS.COMMERCIAL, periods: ['monthly', 'yearly'], attributes: [attribute('shopArea', 'Shop area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' }), attribute('floorNumber', 'Floor number', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'commercial_building', name: 'Commercial building', group: CATEGORY_GROUPS.COMMERCIAL, periods: ['monthly', 'yearly'], attributes: [attribute('floors', 'Floors', ATTRIBUTE_TYPES.INTEGER), attribute('totalArea', 'Total area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' })] },
  { code: 'hotel', name: 'Hotel', group: CATEGORY_GROUPS.HOSPITALITY, periods: ['daily', 'weekly'], attributes: [attribute('roomType', 'Room type', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'standard', label: 'Standard' }, { value: 'deluxe', label: 'Deluxe' }, { value: 'suite', label: 'Suite' }] }), attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER), attribute('bedCount', 'Bed count', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'hostel', name: 'Hostel', group: CATEGORY_GROUPS.HOSPITALITY, periods: ['daily', 'weekly', 'monthly'], attributes: [attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER), attribute('bedCount', 'Bed count', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'guest_house', name: 'Guest house', group: CATEGORY_GROUPS.HOSPITALITY, periods: ['daily', 'weekly', 'monthly'], attributes: [attribute('bedrooms', 'Bedrooms', ATTRIBUTE_TYPES.INTEGER), attribute('guestCapacity', 'Guest capacity', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'factory', name: 'Factory', group: CATEGORY_GROUPS.INDUSTRIAL, periods: ['monthly', 'yearly'], attributes: [attribute('area', 'Area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' }), attribute('powerCapacity', 'Power capacity', ATTRIBUTE_TYPES.STRING)] },
  { code: 'warehouse', name: 'Warehouse', group: CATEGORY_GROUPS.INDUSTRIAL, periods: ['monthly', 'yearly'], attributes: [attribute('area', 'Area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' }), attribute('loadingDocks', 'Loading docks', ATTRIBUTE_TYPES.INTEGER)] },
  { code: 'agricultural_land', name: 'Agricultural land', group: CATEGORY_GROUPS.LAND, periods: ['monthly', 'yearly'], attributes: [attribute('landArea', 'Land area', ATTRIBUTE_TYPES.NUMBER, { unit: 'acre' }), attribute('landType', 'Land type', ATTRIBUTE_TYPES.ENUM, { options: [{ value: 'crop', label: 'Crop' }, { value: 'orchard', label: 'Orchard' }] }), attribute('roadAccess', 'Road access', ATTRIBUTE_TYPES.BOOLEAN)] },
  { code: 'residential_plot', name: 'Residential plot', group: CATEGORY_GROUPS.LAND, periods: ['yearly'], attributes: [attribute('landArea', 'Land area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' }), attribute('roadAccess', 'Road access', ATTRIBUTE_TYPES.BOOLEAN)] },
  { code: 'commercial_plot', name: 'Commercial plot', group: CATEGORY_GROUPS.LAND, periods: ['yearly'], attributes: [attribute('landArea', 'Land area', ATTRIBUTE_TYPES.NUMBER, { unit: 'sqft' }), attribute('roadAccess', 'Road access', ATTRIBUTE_TYPES.BOOLEAN)] }
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
          allowedRentalPeriods: item.periods,
          attributeSchema: item.attributes,
          createdBy: admin._id
        },
        $setOnInsert: { code: item.code, attributeSchemaVersion: 1, sortOrder: 0 }
      },
      { upsert: true }
    );
  }

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
