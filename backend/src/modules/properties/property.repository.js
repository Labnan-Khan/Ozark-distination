import { APPROVAL_STATUS, LISTING_STATUS } from '../../shared/constants/index.js';
import { buildPaginationMeta, parsePagination } from '../../shared/utils/index.js';
import { ApprovalHistory } from './approvalHistory.model.js';
import { ChangeRequest } from './changeRequest.model.js';
import { DuplicateFlag } from './duplicateFlag.model.js';
import { Property } from './property.model.js';
import { PropertyLifecycleRequest } from './propertyLifecycleRequest.model.js';

const SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'title',
  'listingStatus',
  'approvalStatus',
  'submittedAt',
  'score'
]);

function buildSort(sort, defaultField = 'createdAt') {
  const raw = String(sort || '').trim();
  if (!raw) return { [defaultField]: -1 };
  const direction = raw.startsWith('-') ? -1 : 1;
  const field = direction === -1 ? raw.slice(1) : raw;
  if (SORT_FIELDS.has(field)) return { [field]: direction };
  if (field === 'price') return { 'pricing.rates.amountMinor': direction };
  return { [defaultField]: -1 };
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function paginate(model, filter, query, sortField) {
  const { page, limit, skip } = parsePagination(query);
  const sort = buildSort(query.sort, sortField);
  const base = model.find(filter).sort(sort).skip(skip).limit(limit);
  const [items, total] = await Promise.all([
    withSession(base, null).lean(),
    withSession(model.countDocuments(filter), null)
  ]);
  return { items, total, meta: buildPaginationMeta({ page, limit, total }), sort };
}

export const propertyRepository = {
  async findById(id, session = null) {
    return withSession(Property.findById(id), session);
  },

  async findVisibleById(id, session = null) {
    return withSession(Property.findOne({
      _id: id,
      deletedAt: null,
      listingStatus: LISTING_STATUS.PUBLISHED,
      approvalStatus: APPROVAL_STATUS.APPROVED
    }), session);
  },

  async listOwner(ownerId, query = {}) {
    const filter = { ownerId, deletedAt: null };
    if (query.listingStatus) filter.listingStatus = query.listingStatus;
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    return paginate(Property, filter, query, 'createdAt');
  },

  async listAdmin(query = {}) {
    const filter = {};
    if (query.listingStatus) filter.listingStatus = query.listingStatus;
    if (query.approvalStatus) filter.approvalStatus = query.approvalStatus;
    if (query.ownerId) filter.ownerId = query.ownerId;
    if (query.categoryId) filter.categoryId = query.categoryId;
    return paginate(Property, filter, query, 'createdAt');
  },

  async findChangeRequestById(id, session = null) {
    return withSession(ChangeRequest.findById(id), session);
  },

  async listChangeRequests({ ownerId, propertyId, status } = {}, query = {}) {
    const filter = {};
    if (ownerId) filter.ownerId = ownerId;
    if (propertyId) filter.propertyId = propertyId;
    if (status) filter.status = status;
    return paginate(ChangeRequest, filter, query, 'createdAt');
  },

  async listApprovalHistory(propertyId, query = {}) {
    return paginate(ApprovalHistory, { propertyId }, query, 'createdAt');
  },

  async findDuplicateFlagById(id, session = null) {
    return withSession(DuplicateFlag.findById(id), session);
  },

  async listDuplicates({ status, minScore } = {}, query = {}) {
    const filter = {};
    if (status) filter.status = status;
    if (minScore !== undefined) filter.score = { $gte: minScore };
    return paginate(DuplicateFlag, filter, query, 'createdAt');
  },

  async findLifecycleRequestById(id, session = null) {
    return withSession(PropertyLifecycleRequest.findById(id), session);
  },

  async findPendingLifecycleRequest(propertyId, session = null) {
    return withSession(PropertyLifecycleRequest.findOne({
      propertyId,
      status: 'pending'
    }), session);
  },

  async listLifecycleRequests({ ownerId, propertyId, status, action } = {}, query = {}) {
    const filter = {};
    if (ownerId) filter.ownerId = ownerId;
    if (propertyId) filter.propertyId = propertyId;
    if (status) filter.status = status;
    if (action) filter.action = action;
    return paginate(PropertyLifecycleRequest, filter, query, 'createdAt');
  }
};
