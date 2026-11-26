import { afterEach, describe, expect, it, jest } from '@jest/globals';
import mongoose from 'mongoose';
import { AvailabilityReservation } from '../../src/modules/bookings/reservation.model.js';
import {
  buildBaseFilter,
  buildReservationConflictFilter,
  findReservedPropertyIds
} from '../../src/modules/search/search.service.js';
import { User } from '../../src/modules/users/user.model.js';
import { APPROVAL_STATUS, LISTING_STATUS } from '../../src/shared/constants/index.js';
import { toDateOnly } from '../../src/shared/utils/index.js';

afterEach(() => jest.restoreAllMocks());

function mockDistinct(model, result) {
  return jest.spyOn(model, 'distinct').mockReturnValue({
    exec: jest.fn().mockResolvedValue(result)
  });
}

describe('search reservation-aware date filtering', () => {
  it('builds a reusable $nin exclusion from conflicting property ids', () => {
    const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
    expect(buildReservationConflictFilter(ids)).toEqual({ _id: { $nin: ids } });
  });

  it('omits the exclusion clause when there are no conflicts', () => {
    expect(buildReservationConflictFilter([])).toEqual({});
    expect(buildReservationConflictFilter(undefined)).toEqual({});
  });

  it('queries reservations with a half-open UTC date range', async () => {
    const ids = [new mongoose.Types.ObjectId()];
    const distinct = mockDistinct(AvailabilityReservation, ids);

    await expect(findReservedPropertyIds('2030-05-10', '2030-05-13')).resolves.toEqual(ids);
    expect(distinct).toHaveBeenCalledWith('propertyId', {
      date: { $gte: toDateOnly('2030-05-10'), $lt: toDateOnly('2030-05-13') }
    });
  });

  it('combines owner, reservation and public visibility filters', async () => {
    const ownerIds = [new mongoose.Types.ObjectId()];
    const conflictIds = [new mongoose.Types.ObjectId()];
    mockDistinct(User, ownerIds);
    const reservationDistinct = mockDistinct(AvailabilityReservation, conflictIds);

    const filter = await buildBaseFilter({
      checkIn: '2030-05-10',
      checkOut: '2030-05-13',
      city: 'Lahore'
    });

    expect(filter).toMatchObject({
      deletedAt: null,
      listingStatus: LISTING_STATUS.PUBLISHED,
      approvalStatus: APPROVAL_STATUS.APPROVED,
      ownerId: { $in: ownerIds },
      _id: { $nin: conflictIds },
      'availability.isOpenForBooking': true
    });
    expect(filter['availability.status']).toBeUndefined();
    expect(reservationDistinct).toHaveBeenCalledTimes(1);
  });

  it('skips the reservation lookup when no date range is supplied', async () => {
    mockDistinct(User, []);
    const reservationDistinct = mockDistinct(AvailabilityReservation, []);

    const filter = await buildBaseFilter({});

    expect(reservationDistinct).not.toHaveBeenCalled();
    expect(filter._id).toBeUndefined();
    expect(filter['availability.isOpenForBooking']).toBeUndefined();
  });
});
