import { appConfig } from '../../config/appConfig.js';
import { BOOKING_STATUS, RENTAL_PERIODS } from '../../shared/constants/index.js';
import { badRequest } from '../../shared/errors/index.js';

const PERIOD_DAYS = {
  [RENTAL_PERIODS.DAILY]: 1,
  [RENTAL_PERIODS.WEEKLY]: 7,
  [RENTAL_PERIODS.MONTHLY]: 30,
  [RENTAL_PERIODS.YEARLY]: 365,
  [RENTAL_PERIODS.CUSTOM]: 1
};

function dayCount(checkIn, checkOut) {
  const start = new Date(checkIn).getTime();
  const end = new Date(checkOut).getTime();
  return Math.round((end - start) / 86400000);
}

export const pricingService = {
  calculate(propertySnapshot, { checkIn, checkOut, rentalPeriod, guests }) {
    const days = dayCount(checkIn, checkOut);
    if (days <= 0) throw badRequest('checkOut must be after checkIn');

    const divisor = PERIOD_DAYS[rentalPeriod];
    if (!divisor) throw badRequest('Unsupported rental period');
    if (rentalPeriod !== RENTAL_PERIODS.CUSTOM && days % divisor !== 0) {
      throw badRequest(`Date range must be an exact multiple of ${rentalPeriod} periods`);
    }

    const units = rentalPeriod === RENTAL_PERIODS.CUSTOM ? days : days / divisor;
    const config = propertySnapshot.bookingConfig || {};
    const minUnits = config.minUnits || 1;
    const maxUnits = config.maxUnits || 3650;
    if (units < minUnits || units > maxUnits) {
      throw badRequest(`Rental duration must be between ${minUnits} and ${maxUnits} ${rentalPeriod} periods`);
    }

    if (config.requireGuestCount && (!guests || guests < 1)) {
      throw badRequest('Guest count is required for this property');
    }
    if (guests && config.maxGuests && guests > config.maxGuests) {
      throw badRequest(`Maximum ${config.maxGuests} guests are allowed`);
    }

    const rates = propertySnapshot.pricing?.rates || [];
    const rate = rates.find((item) => item.period === rentalPeriod);
    if (!rate || !Number.isFinite(rate.amountMinor)) {
      throw badRequest('No price is configured for the selected rental period');
    }

    const currency = propertySnapshot.pricing?.currency || appConfig.defaults.currency;
    const subtotalMinor = rate.amountMinor * units;
    const charges = [];
    const discounts = [];
    const taxMinor = 0;
    const totalMinor = subtotalMinor + charges.reduce((sum, item) => sum + item.amountMinor, 0)
      - discounts.reduce((sum, item) => sum + item.amountMinor, 0) + taxMinor;

    return {
      currency,
      period: rentalPeriod,
      units,
      unitAmountMinor: rate.amountMinor,
      subtotalMinor,
      charges,
      discounts,
      taxMinor,
      totalMinor,
      ratesUsed: [{ period: rentalPeriod, amountMinor: rate.amountMinor }],
      calculationVersion: 1,
      calculatedAt: new Date()
    };
  },

  assertWindow(propertySnapshot, checkIn, checkOut) {
    const start = new Date(checkIn).getTime();
    const end = new Date(checkOut).getTime();
    const now = Date.now();
    const availability = propertySnapshot.availability || {};
    const leadMs = (availability.leadTimeDays || 0) * 86400000;
    const maxMs = (availability.maxAdvanceDays || appConfig.defaults.maxAdvanceDays) * 86400000;
    if (start < now + leadMs) throw badRequest('Check-in is before the allowed lead time');
    if (start > now + maxMs) throw badRequest('Check-in is beyond the booking window');
    if (end <= start) throw badRequest('Invalid date range');
  },

  statusForMode(mode) {
    return mode === 'instant' ? BOOKING_STATUS.CONFIRMED : BOOKING_STATUS.PENDING;
  }
};
