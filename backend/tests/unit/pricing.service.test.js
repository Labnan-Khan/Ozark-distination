import { describe, expect, it } from '@jest/globals';
import { pricingService } from '../../src/modules/bookings/pricing.service.js';

const baseProperty = {
  pricing: {
    currency: 'PKR',
    rates: [
      { period: 'daily', amountMinor: 100000 },
      { period: 'monthly', amountMinor: 2500000 }
    ],
    version: 1
  },
  bookingConfig: { minUnits: 1, maxUnits: 24, requireGuestCount: false, maxGuests: 4 },
  availability: { leadTimeDays: 0, maxAdvanceDays: 365 }
};

describe('pricingService.calculate', () => {
  it('calculates daily pricing from the server-side rate', () => {
    const result = pricingService.calculate(baseProperty, {
      checkIn: '2030-01-01',
      checkOut: '2030-01-04',
      rentalPeriod: 'daily'
    });
    expect(result.units).toBe(3);
    expect(result.subtotalMinor).toBe(300000);
    expect(result.totalMinor).toBe(300000);
    expect(result.currency).toBe('PKR');
  });

  it('rejects ranges that are not exact multiples of the period', () => {
    expect(() => pricingService.calculate(baseProperty, {
      checkIn: '2030-01-01',
      checkOut: '2030-01-10',
      rentalPeriod: 'monthly'
    })).toThrow();
  });

  it('enforces minimum and maximum rental units', () => {
    expect(() => pricingService.calculate(baseProperty, {
      checkIn: '2030-01-01',
      checkOut: '2032-01-21',
      rentalPeriod: 'monthly'
    })).toThrow(/Rental duration/);
  });

  it('rejects a price when no rate is configured for the period', () => {
    expect(() => pricingService.calculate(baseProperty, {
      checkIn: '2030-01-01',
      checkOut: '2030-01-08',
      rentalPeriod: 'weekly'
    })).toThrow(/No price/);
  });

  it('validates guest requirements', () => {
    const property = {
      ...baseProperty,
      bookingConfig: { ...baseProperty.bookingConfig, requireGuestCount: true, maxGuests: 2 }
    };
    expect(() => pricingService.calculate(property, {
      checkIn: '2030-01-01',
      checkOut: '2030-01-02',
      rentalPeriod: 'daily'
    })).toThrow(/Guest count/);
    expect(() => pricingService.calculate(property, {
      checkIn: '2030-01-01',
      checkOut: '2030-01-02',
      rentalPeriod: 'daily',
      guests: 3
    })).toThrow(/Maximum 2/);
  });
});

describe('pricingService.assertWindow', () => {
  it('rejects check-in dates beyond the configured window', () => {
    expect(() => pricingService.assertWindow(baseProperty, '2099-01-01', '2099-01-02')).toThrow(/booking window/);
  });
});
