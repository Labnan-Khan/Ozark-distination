import { ACCOUNT_STATUS, APPROVAL_STATUS, LISTING_STATUS } from '../../shared/constants/index.js';
import { badRequest } from '../../shared/errors/index.js';
import { buildPaginationMeta, parsePagination, toDateOnly, toObjectId } from '../../shared/utils/index.js';
import { AvailabilityReservation } from '../bookings/reservation.model.js';
import { Property } from '../properties/property.model.js';
import { User } from '../users/user.model.js';

const PUBLIC_VISIBILITY = Object.freeze({
  deletedAt: null,
  listingStatus: LISTING_STATUS.PUBLISHED,
  approvalStatus: APPROVAL_STATUS.APPROVED
});

/** Explicit whitelist: no owner, approval actor, soft-delete or internal tracking fields. */
const PROJECTION = Object.freeze({
  _id: 1,
  id: { $toString: '$_id' },
  title: 1,
  description: 1,
  categoryId: 1,
  categorySnapshot: 1,
  address: 1,
  location: 1,
  attributes: 1,
  amenities: 1,
  amenitySnapshot: 1,
  pricing: 1,
  rentalPeriods: 1,
  availability: 1,
  media: 1,
  listingStatus: 1,
  approvalStatus: 1,
  createdAt: 1,
  updatedAt: 1
});

const PUBLIC_FIELDS = Object.keys(PROJECTION)
  .filter((field) => field !== 'id')
  .join(' ');

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function exactRegex(value) {
  return new RegExp(`^${escapeRegex(value)}$`, 'i');
}

function attributeClause(key, rawValue) {
  if (Array.isArray(rawValue)) {
    const values = rawValue.map(String);
    return {
      attributes: {
        $elemMatch: {
          key,
          $or: [
            { stringValue: { $in: values.map(exactRegex) } },
            { arrayValue: { $all: values } }
          ]
        }
      }
    };
  }

  const text = String(rawValue);
  const clauses = [{ stringValue: exactRegex(text) }, { arrayValue: text }];
  if (/^-?\d+(?:\.\d+)?$/.test(text)) clauses.push({ numberValue: Number(text) });
  if (/^(true|false)$/i.test(text)) clauses.push({ booleanValue: text.toLowerCase() === 'true' });
  if (/\d{4}-\d{2}-\d{2}/.test(text)) {
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) clauses.push({ dateValue: date });
  }
  return { attributes: { $elemMatch: { key, $or: clauses } } };
}

/** Exclusion clause consumed by find, countDocuments, $match and $geoNear.query alike. */
export function buildReservationConflictFilter(propertyIds) {
  if (!propertyIds?.length) return {};
  return { _id: { $nin: propertyIds } };
}

/**
 * Reservation documents are active by construction (released on cancellation) and the
 * model has no status field, so every document in the half-open range is a conflict.
 */
export async function findReservedPropertyIds(checkIn, checkOut) {
  let start;
  let end;
  try {
    start = toDateOnly(checkIn);
    end = toDateOnly(checkOut);
  } catch {
    throw badRequest('checkIn and checkOut must be valid YYYY-MM-DD dates');
  }
  return AvailabilityReservation.distinct('propertyId', {
    date: { $gte: start, $lt: end }
  }).exec();
}

async function findActiveOwnerIds() {
  return User.distinct('_id', {
    accountStatus: ACCOUNT_STATUS.ACTIVE,
    deletedAt: null
  }).exec();
}

export async function buildBaseFilter(query = {}) {
  const filter = { ...PUBLIC_VISIBILITY };
  const attributeMatches = [];

  if (query.q) {
    const pattern = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }, { searchKeywords: pattern }];
  }

  for (const [param, field] of [
    ['country', 'address.country'],
    ['stateProvince', 'address.stateProvince'],
    ['city', 'address.city'],
    ['area', 'address.area']
  ]) {
    if (query[param]) filter[field] = exactRegex(query[param]);
  }

  if (query.categoryId) filter.categoryId = toObjectId(query.categoryId);
  if (query.subcategoryId) filter.subcategoryId = toObjectId(query.subcategoryId);
  // V1 keeps only a category snapshot on listings; subcategoryCode is matched against it.
  if (query.subcategoryCode) filter['categorySnapshot.code'] = exactRegex(query.subcategoryCode);

  const hasMin = query.minPrice !== undefined && query.minPrice !== null && query.minPrice !== '';
  const hasMax = query.maxPrice !== undefined && query.maxPrice !== null && query.maxPrice !== '';
  if (hasMin && hasMax && Number(query.minPrice) > Number(query.maxPrice)) {
    throw badRequest('minPrice cannot exceed maxPrice');
  }
  const amountRange = {};
  if (hasMin) amountRange.$gte = Number(query.minPrice);
  if (hasMax) amountRange.$lte = Number(query.maxPrice);
  if (query.period || Object.keys(amountRange).length) {
    const rate = {};
    if (query.period) rate.period = query.period;
    if (Object.keys(amountRange).length) rate.amountMinor = amountRange;
    filter['pricing.rates'] = { $elemMatch: rate };
  }

  if (query.amenities) {
    const amenityIds = Array.isArray(query.amenities)
      ? query.amenities
      : String(query.amenities).split(',').map((id) => id.trim()).filter(Boolean);
    if (amenityIds.length) filter.amenities = { $all: amenityIds.map((id) => toObjectId(id)) };
  }

  if (query.bedroomsMin !== undefined) {
    attributeMatches.push({
      attributes: { $elemMatch: { key: 'bedrooms', numberValue: { $gte: Number(query.bedroomsMin) } } }
    });
  }
  if (query.bathroomsMin !== undefined) {
    attributeMatches.push({
      attributes: { $elemMatch: { key: 'bathrooms', numberValue: { $gte: Number(query.bathroomsMin) } } }
    });
  }
  if (query.furnishing) {
    attributeMatches.push({
      attributes: { $elemMatch: { key: 'furnishing', stringValue: exactRegex(query.furnishing) } }
    });
  }
  for (const [key, value] of Object.entries(query.attributes || {})) {
    attributeMatches.push(attributeClause(key, value));
  }
  if (attributeMatches.length) filter.$and = attributeMatches;

  if (query.checkIn || query.checkOut) {
    if (!query.checkIn || !query.checkOut) {
      throw badRequest('checkIn and checkOut must be provided together');
    }
    if (query.checkOut <= query.checkIn) throw badRequest('checkOut must be after checkIn');
  }

  // Active owners and exact date conflicts are each resolved once; both produce plain
  // filters that work for find/countDocuments, aggregation $match and $geoNear.query.
  // The cached availability.status is today-only, so reservations are authoritative here.
  const [activeOwnerIds, reservedPropertyIds] = await Promise.all([
    findActiveOwnerIds(),
    query.checkIn && query.checkOut
      ? findReservedPropertyIds(query.checkIn, query.checkOut)
      : []
  ]);
  filter.ownerId = { $in: activeOwnerIds };
  Object.assign(filter, buildReservationConflictFilter(reservedPropertyIds));
  if (query.checkIn && query.checkOut) filter['availability.isOpenForBooking'] = true;

  return filter;
}

function priceSortExpression(period) {
  const rates = period
    ? {
      $filter: {
        input: { $ifNull: ['$pricing.rates', []] },
        as: 'rate',
        cond: { $eq: ['$$rate.period', period] }
      }
    }
    : { $ifNull: ['$pricing.rates', []] };
  const amounts = { $map: { input: rates, as: 'rate', in: '$$rate.amountMinor' } };
  return { $ifNull: [{ $min: amounts }, Number.MAX_SAFE_INTEGER] };
}

function buildProjection(includeDistance) {
  const projection = { ...PROJECTION };
  if (includeDistance) projection.distanceMeters = '$__distance';
  return projection;
}

/** Common path: lean documents with an explicit field whitelist. */
async function simpleSearch(filter, pagination) {
  const total = await Property.countDocuments(filter).exec();
  const documents = await Property.find(filter)
    .select(PUBLIC_FIELDS)
    .sort({ createdAt: -1 })
    .skip(pagination.skip)
    .limit(pagination.limit)
    .lean()
    .exec();
  return {
    items: documents.map((document) => ({ ...document, id: String(document._id) })),
    meta: buildPaginationMeta({ page: pagination.page, limit: pagination.limit, total })
  };
}

async function runPipeline({ filter, countFilter, query, pagination, geoStage = null, includeDistance = false }) {
  const total = await Property.countDocuments(countFilter || filter).exec();

  const pipeline = [];
  if (geoStage) pipeline.push(geoStage);
  else pipeline.push({ $match: filter });

  const priceSort = query.sort === 'price_asc' || query.sort === 'price_desc';
  if (priceSort) pipeline.push({ $addFields: { __sortPrice: priceSortExpression(query.period) } });
  pipeline.push({
    $sort: priceSort
      ? { __sortPrice: query.sort === 'price_asc' ? 1 : -1, createdAt: -1 }
      : { createdAt: -1 }
  });
  pipeline.push(
    { $skip: pagination.skip },
    { $limit: pagination.limit },
    { $project: buildProjection(includeDistance) }
  );

  const items = await Property.aggregate(pipeline).exec();
  return {
    items,
    meta: buildPaginationMeta({ page: pagination.page, limit: pagination.limit, total })
  };
}

function parseBbox(value) {
  const parts = String(value).split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    throw badRequest('bbox must be minLng,minLat,maxLng,maxLat');
  }
  const [minLng, minLat, maxLng, maxLat] = parts;
  if (
    minLng < -180 || maxLng > 180 || minLat < -90 || maxLat > 90 ||
    minLng >= maxLng || minLat >= maxLat
  ) {
    throw badRequest('Invalid bbox coordinates');
  }
  return { minLng, minLat, maxLng, maxLat };
}

export const searchService = {
  async search(query = {}) {
    const filter = await buildBaseFilter(query);
    const pagination = parsePagination(query);
    if (query.sort === 'newest') return simpleSearch(filter, pagination);
    return runPipeline({ filter, query, pagination });
  },

  async mapSearch(query = {}) {
    const filter = await buildBaseFilter(query);
    const pagination = parsePagination(query);
    const hasBbox = Boolean(query.bbox);
    const hasCenter = query.lat !== undefined && query.lng !== undefined;

    if (hasBbox && hasCenter) throw badRequest('Use either bbox or lat/lng/radiusKm, not both');

    if (hasBbox) {
      const { minLng, minLat, maxLng, maxLat } = parseBbox(query.bbox);
      const geoFilter = {
        location: {
          $geoWithin: {
            $geometry: {
              type: 'Polygon',
              coordinates: [[
                [minLng, minLat],
                [maxLng, minLat],
                [maxLng, maxLat],
                [minLng, maxLat],
                [minLng, minLat]
              ]]
            }
          }
        }
      };
      return simpleSearch({ ...filter, ...geoFilter }, pagination);
    }

    if (hasCenter) {
      if (query.radiusKm === undefined) throw badRequest('radiusKm is required with lat/lng');
      const lng = Number(query.lng);
      const lat = Number(query.lat);
      const radiusKm = Number(query.radiusKm);
      if (![lng, lat, radiusKm].every(Number.isFinite) || radiusKm <= 0) {
        throw badRequest('Invalid lat, lng or radiusKm');
      }

      const geoStage = {
        $geoNear: {
          near: { type: 'Point', coordinates: [lng, lat] },
          distanceField: '__distance',
          maxDistance: radiusKm * 1000,
          spherical: true,
          query: filter
        }
      };
      // $near cannot be counted directly; an equivalent spherical circle keeps meta accurate.
      const countFilter = {
        ...filter,
        location: { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / 6371] } }
      };
      return runPipeline({ filter, countFilter, query, pagination, geoStage, includeDistance: true });
    }

    throw badRequest('bbox or lat,lng,radiusKm is required for map search');
  }
};
