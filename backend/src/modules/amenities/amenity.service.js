import { badRequest, conflict, notFound } from '../../shared/errors/index.js';
import { Amenity } from './amenity.model.js';

function actorIdOf(actor) {
  if (!actor) return null;
  if (typeof actor === 'object') return actor._id || actor.id || null;
  return actor;
}

function requireActor(actor) {
  const id = actorIdOf(actor);
  if (!id) throw badRequest('An admin actor is required');
  return id;
}

async function findAmenity(id) {
  const amenity = await Amenity.findOne({ _id: id, deletedAt: null });
  if (!amenity) throw notFound('Amenity not found');
  return amenity;
}

function isIdInput(input) {
  return typeof input === 'string' || Boolean(input?._bsontype);
}

export const amenitiesService = {
  /** Accepts a category id directly, or filters such as { categoryId, includeInactive }. */
  async listActive(input = {}) {
    const filters = isIdInput(input) ? { categoryId: input } : (input || {});
    const query = { deletedAt: null };
    if (!filters.includeInactive) query.isActive = true;
    if (filters.categoryId) query.categoryIds = filters.categoryId;

    return Amenity.find(query).sort({ sortOrder: 1, name: 1 }).lean().exec();
  },

  async getByIds(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    return Amenity.find({ _id: { $in: ids }, deletedAt: null }).lean().exec();
  },

  async validateIds(ids) {
    if (!Array.isArray(ids)) throw badRequest('amenities must be an array of ids');
    const normalized = [...new Set(ids.map(String))];
    if (normalized.length === 0) return normalized;

    const found = await Amenity.find({ _id: { $in: normalized }, deletedAt: null })
      .select('_id isActive')
      .lean()
      .exec();
    const byId = new Map(found.map((amenity) => [String(amenity._id), amenity]));
    const details = [];
    for (const id of normalized) {
      const amenity = byId.get(id);
      if (!amenity) details.push({ field: 'amenities', message: `Unknown amenity: ${id}` });
      else if (!amenity.isActive) details.push({ field: 'amenities', message: `Inactive amenity: ${id}` });
    }
    if (details.length) throw badRequest('Invalid amenity ids', details);
    return normalized;
  },

  /** Snapshots survive amenity deactivation/renaming; only soft-deleted rows are omitted. */
  async getSnapshot(ids) {
    if (!Array.isArray(ids) || ids.length === 0) return [];
    const normalized = [...new Set(ids.map(String))];
    const found = await Amenity.find({ _id: { $in: normalized }, deletedAt: null })
      .select('code name')
      .lean()
      .exec();
    const byId = new Map(found.map((amenity) => [String(amenity._id), {
      id: String(amenity._id),
      code: amenity.code,
      name: amenity.name
    }]));
    return normalized.map((id) => byId.get(id)).filter(Boolean);
  },

  async create(input, actor) {
    const code = String(input.code || '').trim().toLowerCase();
    if (await Amenity.exists({ code })) {
      throw conflict('DUPLICATE_RESOURCE', 'Amenity code already exists');
    }
    return Amenity.create({
      code,
      name: input.name,
      description: input.description ?? null,
      icon: input.icon ?? null,
      isActive: input.isActive ?? true,
      categoryIds: input.categoryIds ?? [],
      sortOrder: input.sortOrder ?? 0,
      createdBy: requireActor(actor)
    });
  },

  async update(id, input, actor) {
    const amenity = await findAmenity(id);
    // `actor` is accepted for the service contract; audit recording is handled by the admin/audit module.
    if (input.code && input.code !== amenity.code) {
      const code = String(input.code).trim().toLowerCase();
      if (await Amenity.exists({ code, _id: { $ne: amenity._id } })) {
        throw conflict('DUPLICATE_RESOURCE', 'Amenity code already exists');
      }
      amenity.code = code;
    }
    for (const field of ['name', 'description', 'icon', 'isActive', 'categoryIds', 'sortOrder']) {
      if (input[field] !== undefined) amenity[field] = input[field];
    }
    await amenity.save();
    return amenity;
  },

  async deactivate(id, actor) {
    const amenity = await findAmenity(id);
    // `actor` is accepted for the service contract; audit recording is handled by the admin/audit module.
    amenity.isActive = false;
    await amenity.save();
    return amenity;
  }
};
