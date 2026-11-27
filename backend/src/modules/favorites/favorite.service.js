import { APPROVAL_STATUS, AVAILABILITY_STATUS, LISTING_STATUS } from '../../shared/constants/index.js';
import { conflict, notFound } from '../../shared/errors/index.js';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/index.js';
import { mediaService } from '../media/index.js';
import { Property } from '../properties/property.model.js';
import { Favorite } from './favorite.model.js';

/** Public visibility per the database blueprint; owner-status is checked by the properties module. */
const PUBLIC_VISIBILITY = Object.freeze({
  deletedAt: null,
  listingStatus: LISTING_STATUS.PUBLISHED,
  approvalStatus: APPROVAL_STATUS.APPROVED
});

const LIST_VISIBILITY = Object.freeze({
  ...PUBLIC_VISIBILITY,
  'availability.isOpenForBooking': { $ne: false },
  'availability.status': { $ne: AVAILABILITY_STATUS.UNAVAILABLE }
});

const PROPERTY_FIELDS = [
  'title',
  'description',
  'categoryId',
  'categorySnapshot',
  'address',
  'location',
  'attributes',
  'amenities',
  'amenitySnapshot',
  'pricing',
  'rentalPeriods',
  'availability',
  'media',
  'createdAt',
  'updatedAt'
].join(' ');

export const favoritesService = {
  async add(userId, propertyId) {
    const visible = await Property.exists({ _id: propertyId, ...PUBLIC_VISIBILITY });
    if (!visible) throw notFound('Property not found or not available');

    try {
      return await Favorite.create({ userId, propertyId });
    } catch (error) {
      if (error?.code === 11000) throw conflict('ALREADY_FAVORITE', 'Property is already in favorites');
      throw error;
    }
  },

  /** Removal is idempotent: deleting a non-favorite row is a successful no-op. */
  async remove(userId, propertyId) {
    return Favorite.deleteOne({ userId, propertyId });
  },

  /**
   * Favorites are filtered by currently visible properties first so pagination meta
   * describes the properties actually returned, then property data is populated.
   */
  async list(userId, pagination = {}) {
    const { page, limit, skip } = parsePagination(pagination);
    const visibleProperties = await Property.find(LIST_VISIBILITY).select('_id').lean().exec();
    const propertyIds = visibleProperties.map((property) => property._id);

    const query = { userId, propertyId: { $in: propertyIds } };
    const total = await Favorite.countDocuments(query);
    const direction = String(pagination?.sort || '').startsWith('-') ? -1 : 1;
    const favorites = await Favorite.find(query)
      .sort({ createdAt: direction })
      .skip(skip)
      .limit(limit)
      .populate({ path: 'propertyId', select: PROPERTY_FIELDS, match: LIST_VISIBILITY })
      .lean()
      .exec();

    const items = await mediaService.attachCovers(favorites.map((favorite) => favorite.propertyId).filter(Boolean));
    const meta = buildPaginationMeta({ page, limit, total });
    return { items, properties: items, meta };
  },

  async status(userId, propertyId) {
    const [favorite, property] = await Promise.all([
      Favorite.exists({ userId, propertyId }),
      Property.findOne({ _id: propertyId, ...LIST_VISIBILITY }).select('_id').lean()
    ]);
    return { isFavorite: Boolean(favorite), available: Boolean(property) };
  },

  async isFavorite(userId, propertyId) {
    return Boolean(await Favorite.exists({ userId, propertyId }));
  }
};
