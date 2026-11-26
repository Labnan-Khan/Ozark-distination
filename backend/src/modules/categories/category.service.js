import { ATTRIBUTE_TYPES } from '../../shared/constants/index.js';
import { badRequest, conflict, notFound } from '../../shared/errors/index.js';
import { toDateOnly } from '../../shared/utils/index.js';
import { ATTRIBUTE_VALUE_SLOTS, CATEGORY_SORT_OPTIONS, DEFAULT_RENTAL_PERIODS } from './category.constants.js';
import { PropertyCategory } from './propertyCategory.model.js';

const INVALID = Symbol('invalid');

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

async function findCategory(id) {
  const category = await PropertyCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw notFound('Category not found');
  return category;
}

async function assertParentExists(parentId, selfId = null) {
  if (!parentId) return;
  if (selfId && String(parentId) === String(selfId)) {
    throw badRequest('A category cannot be its own parent', [{ field: 'parentId', message: 'self reference' }]);
  }
  const parent = await PropertyCategory.exists({ _id: parentId, deletedAt: null });
  if (!parent) throw badRequest('Parent category not found', [{ field: 'parentId', message: 'unknown category' }]);
}

function sortStage(sort) {
  const value = CATEGORY_SORT_OPTIONS.includes(sort) ? sort : 'sortOrder';
  const direction = value.startsWith('-') ? -1 : 1;
  const field = value.replace(/^-/, '');
  return field === 'sortOrder' ? { sortOrder: 1, name: 1 } : { [field]: direction };
}

function normalizeAttributeInput(attributes) {
  if (Array.isArray(attributes)) return attributes;
  if (attributes && typeof attributes === 'object') {
    return Object.entries(attributes).map(([key, value]) => ({ key, value }));
  }
  return null;
}

function rawValueOf(item, dataType) {
  if (!item || typeof item !== 'object') return undefined;
  if (Object.prototype.hasOwnProperty.call(item, 'value')) return item.value;
  const slot = ATTRIBUTE_VALUE_SLOTS[dataType];
  return slot ? item[slot] : undefined;
}

function coerceValue(definition, raw, details) {
  const fail = (message) => {
    details.push({ field: definition.key, message });
    return INVALID;
  };

  switch (definition.dataType) {
    case ATTRIBUTE_TYPES.STRING:
    case ATTRIBUTE_TYPES.ENUM: {
      if (typeof raw !== 'string') return fail('must be a string');
      const value = raw.trim();
      if (definition.minLength != null && value.length < definition.minLength) {
        return fail(`must contain at least ${definition.minLength} characters`);
      }
      if (definition.maxLength != null && value.length > definition.maxLength) {
        return fail(`must contain at most ${definition.maxLength} characters`);
      }
      if (definition.pattern) {
        let pattern;
        try {
          pattern = new RegExp(definition.pattern);
        } catch {
          return fail('has an invalid pattern configured for this category');
        }
        if (!pattern.test(value)) return fail('does not match the required pattern');
      }
      if (definition.dataType === ATTRIBUTE_TYPES.ENUM) {
        const allowed = (definition.options || []).map((option) => option.value);
        if (!allowed.includes(value)) return fail(`must be one of: ${allowed.join(', ')}`);
      }
      return value;
    }
    case ATTRIBUTE_TYPES.NUMBER:
    case ATTRIBUTE_TYPES.INTEGER: {
      if (typeof raw !== 'number' || !Number.isFinite(raw)) return fail('must be a finite number');
      if (definition.dataType === ATTRIBUTE_TYPES.INTEGER && !Number.isInteger(raw)) return fail('must be an integer');
      if (definition.min != null && raw < definition.min) return fail(`must be at least ${definition.min}`);
      if (definition.max != null && raw > definition.max) return fail(`must be at most ${definition.max}`);
      return raw;
    }
    case ATTRIBUTE_TYPES.BOOLEAN:
      if (typeof raw !== 'boolean') return fail('must be a boolean');
      return raw;
    case ATTRIBUTE_TYPES.MULTI_ENUM: {
      if (!Array.isArray(raw)) return fail('must be an array of option values');
      const allowed = (definition.options || []).map((option) => option.value);
      const values = [];
      for (const entry of raw) {
        if (typeof entry !== 'string' || !allowed.includes(entry)) {
          return fail(`contains an invalid option: ${String(entry)}`);
        }
        values.push(entry);
      }
      if (definition.required && values.length === 0) return fail('must contain at least one option');
      return values;
    }
    case ATTRIBUTE_TYPES.DATE: {
      if (!(raw instanceof Date) && typeof raw !== 'string' && typeof raw !== 'number') {
        return fail('must be a valid date');
      }
      const date = new Date(raw);
      if (Number.isNaN(date.getTime())) return fail('must be a valid date');
      if (typeof raw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        try {
          return toDateOnly(raw);
        } catch {
          return fail('must be a valid calendar date');
        }
      }
      return date;
    }
    default:
      return fail('has an unsupported data type');
  }
}

export const categoriesService = {
  async listActive(filters = {}) {
    const query = { deletedAt: null };
    if (!filters.includeInactive) query.isActive = true;
    if (filters.group) query.group = filters.group;
    if (filters.parentId) query.parentId = filters.parentId;

    return PropertyCategory.find(query).sort(sortStage(filters.sort)).lean().exec();
  },

  async getById(id) {
    return findCategory(id);
  },

  async getByCode(code) {
    const category = await PropertyCategory.findOne({
      code: String(code || '').trim().toLowerCase(),
      deletedAt: null
    });
    if (!category) throw notFound('Category not found');
    return category;
  },

  async create(input, actor) {
    const code = String(input.code || '').trim().toLowerCase();
    if (await PropertyCategory.exists({ code })) {
      throw conflict('DUPLICATE_RESOURCE', 'Category code already exists');
    }
    await assertParentExists(input.parentId);

    return PropertyCategory.create({
      code,
      name: input.name,
      group: input.group,
      parentId: input.parentId || null,
      description: input.description ?? null,
      icon: input.icon ?? null,
      isActive: input.isActive ?? true,
      sortOrder: input.sortOrder ?? 0,
      allowedRentalPeriods: input.allowedRentalPeriods?.length
        ? input.allowedRentalPeriods
        : [...DEFAULT_RENTAL_PERIODS],
      attributeSchema: input.attributeSchema ?? [],
      attributeSchemaVersion: input.attributeSchemaVersion ?? 1,
      createdBy: requireActor(actor)
    });
  },

  async update(id, input, actor) {
    const category = await findCategory(id);
    // `actor` is accepted for the service contract; audit recording is handled by the admin/audit module.

    if (input.code && input.code !== category.code) {
      const code = String(input.code).trim().toLowerCase();
      if (await PropertyCategory.exists({ code, _id: { $ne: category._id } })) {
        throw conflict('DUPLICATE_RESOURCE', 'Category code already exists');
      }
      category.code = code;
    }
    if (input.parentId !== undefined) {
      await assertParentExists(input.parentId, category._id);
      category.parentId = input.parentId || null;
    }
    for (const field of ['name', 'group', 'description', 'icon', 'isActive', 'sortOrder', 'allowedRentalPeriods']) {
      if (input[field] !== undefined) category[field] = input[field];
    }
    if (input.attributeSchema !== undefined) {
      category.attributeSchema = input.attributeSchema;
      category.attributeSchemaVersion += 1;
    }
    await category.save();
    return category;
  },

  async deactivate(id, actor) {
    const category = await findCategory(id);
    // `actor` is accepted for the service contract; audit recording is handled by the admin/audit module.
    category.isActive = false;
    await category.save();
    return category;
  },

  async getAttributeSchema(categoryId) {
    const category = await findCategory(categoryId);
    return category.attributeSchema || [];
  },

  /**
   * Validates free-form caller input against the category's attribute schema and
   * returns structured AttributeValue records. Deprecated definitions are not writable.
   */
  async validateAttributes(categoryId, attributes) {
    const category = await findCategory(categoryId);
    const items = normalizeAttributeInput(attributes);
    if (!items) throw badRequest('attributes must be an array of { key, value } entries');

    const definitions = new Map();
    for (const definition of category.attributeSchema || []) {
      if (!definition.deprecated) definitions.set(definition.key, definition);
    }

    const details = [];
    const seen = new Set();
    const provided = new Map();
    for (const item of items) {
      const key = item?.key;
      if (typeof key !== 'string' || !definitions.has(key)) {
        details.push({ field: 'attributes', message: `Unknown or deprecated attribute key: ${String(key)}` });
        continue;
      }
      if (seen.has(key)) {
        details.push({ field: key, message: 'Duplicate attribute key' });
        continue;
      }
      seen.add(key);
      provided.set(key, rawValueOf(item, definitions.get(key).dataType));
    }

    const validated = [];
    for (const definition of definitions.values()) {
      const hasValue = provided.has(definition.key);
      const raw = hasValue ? provided.get(definition.key) : definition.defaultValue;
      if (!hasValue && (raw === undefined || raw === null)) {
        if (definition.required) details.push({ field: definition.key, message: 'is required' });
        continue;
      }

      const value = coerceValue(definition, raw, details);
      if (value === INVALID) continue;

      const attributeValue = {
        key: definition.key,
        dataType: definition.dataType,
        stringValue: null,
        numberValue: null,
        booleanValue: null,
        dateValue: null,
        arrayValue: null,
        unit: definition.unit ?? null,
        categoryId: category._id,
        schemaVersion: category.attributeSchemaVersion
      };
      attributeValue[ATTRIBUTE_VALUE_SLOTS[definition.dataType]] = value;
      validated.push(attributeValue);
    }

    if (details.length) throw badRequest('Attribute validation failed', details);
    return validated;
  }
};
