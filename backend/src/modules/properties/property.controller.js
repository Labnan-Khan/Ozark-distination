import { primaryRole } from '../../shared/services/index.js';
import { sendSuccess } from '../../middleware/requestContext.js';
import { mediaService } from '../media/index.js';
import { DuplicateFlag } from './duplicateFlag.model.js';
import { propertiesService } from './property.service.js';

function actorFromRequest(req) {
  if (!req.user) return null;
  return {
    _id: req.user._id,
    userId: req.user._id,
    roles: req.user.roles,
    role: primaryRole(req.user),
    correlationId: req.correlationId || req.requestId
  };
}

function listFrom(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.media)) return value.media;
  return [];
}

export const propertyController = {
  async create(req, res) {
    const property = await propertiesService.create(req.body, actorFromRequest(req), req.correlationId);
    return sendSuccess(res, { property }, undefined, 201);
  },

  async getById(req, res) {
    const property = await propertiesService.getById(req.params.id, actorFromRequest(req));
    const media = listFrom(await mediaService.listFor('property', property._id));
    return sendSuccess(res, { property, media, availability: property.availability || null });
  },

  async listMine(req, res) {
    const actor = actorFromRequest(req);
    const result = await propertiesService.listOwner(actor._id, req.query);
    return sendSuccess(res, result);
  },

  async update(req, res) {
    const result = await propertiesService.update(req.params.id, req.body, actorFromRequest(req));
    if (result?.changeRequest) return sendSuccess(res, result, undefined, 202);
    return sendSuccess(res, { property: result });
  },

  async submit(req, res) {
    const property = await propertiesService.submit(req.params.id, actorFromRequest(req), req.body?.note || null);
    return sendSuccess(res, { property });
  },

  async publish(req, res) {
    const property = await propertiesService.publish(req.params.id, actorFromRequest(req));
    return sendSuccess(res, { property });
  },

  async archive(req, res) {
    const result = await propertiesService.archive(req.params.id, actorFromRequest(req), req.body?.reason || null);
    if (result?.request) return sendSuccess(res, { request: result.request }, undefined, 202);
    return sendSuccess(res, { property: result });
  },

  async requestDelete(req, res) {
    const request = await propertiesService.requestDelete(
      req.params.id,
      actorFromRequest(req),
      req.body.reason
    );
    return sendSuccess(res, { request }, undefined, 202);
  },

  async softDelete(req, res) {
    const property = await propertiesService.softDelete(
      req.params.id,
      actorFromRequest(req),
      req.body.reason
    );
    return sendSuccess(res, { property });
  },

  async listMyLifecycleRequests(req, res) {
    const result = await propertiesService.listMyLifecycleRequests(actorFromRequest(req), req.query);
    return sendSuccess(res, result);
  },

  async getLifecycleRequests(req, res) {
    const result = await propertiesService.getLifecycleRequestsForProperty(
      req.params.id,
      actorFromRequest(req),
      req.query
    );
    return sendSuccess(res, result);
  },

  async getAvailability(req, res) {
    const result = await propertiesService.getAvailability(req.params.id, req.query.checkIn, req.query.checkOut);
    return sendSuccess(res, result);
  },

  async blockDates(req, res) {
    const reservations = await propertiesService.blockDates(
      req.params.id,
      req.body,
      actorFromRequest(req),
      req.body?.note || null
    );
    return sendSuccess(res, { reservations }, undefined, 201);
  },

  async unblock(req, res) {
    await propertiesService.unblock(req.params.id, req.params.reservationId, actorFromRequest(req));
    return res.status(204).end();
  },

  async attachMedia(req, res) {
    const media = await propertiesService.attachMedia(
      req.params.id,
      req.files,
      actorFromRequest(req),
      req.correlationId
    );
    return sendSuccess(res, { media }, undefined, 201);
  },

  async patchMedia(req, res) {
    const actor = actorFromRequest(req);
    let media = null;
    if (req.body.isCover) {
      media = await propertiesService.setCover(req.params.id, req.params.mediaId, actor, req.correlationId);
    }
    if (req.body.displayOrder !== undefined) {
      media = await propertiesService.reorderMedia(
        req.params.id,
        [{ mediaId: req.params.mediaId, displayOrder: req.body.displayOrder }],
        actor,
        req.correlationId
      );
    }
    return sendSuccess(res, { media });
  },

  async removeMedia(req, res) {
    const media = await propertiesService.removeMedia(
      req.params.id,
      req.params.mediaId,
      actorFromRequest(req),
      req.correlationId
    );
    return sendSuccess(res, { status: 'pending_delete', media }, undefined, 202);
  },

  async getChangeRequests(req, res) {
    const result = await propertiesService.getChangeRequestsForProperty(req.params.id, req.query);
    return sendSuccess(res, result);
  },

  async getApprovalHistory(req, res) {
    const result = await propertiesService.getApprovalHistory(req.params.id, req.query);
    return sendSuccess(res, result);
  },

  async getAdminList(req, res) {
    const result = await propertiesService.listAdmin(req.query);
    return sendSuccess(res, result);
  },

  async getAdminDetail(req, res) {
    const actor = actorFromRequest(req);
    const property = await propertiesService.getById(req.params.id, actor);
    const [approvalHistory, changeRequests, duplicateFlags] = await Promise.all([
      propertiesService.getApprovalHistory(req.params.id, { limit: 100 }),
      propertiesService.getChangeRequestsForProperty(req.params.id, { limit: 100 }),
      DuplicateFlag.find({ propertyId: property._id }).sort({ createdAt: -1 }).limit(100).lean()
    ]);
    return sendSuccess(res, {
      property,
      approvalHistory: approvalHistory.approvalHistory,
      changeRequests: changeRequests.changeRequests,
      duplicateFlags
    });
  },

  async approve(req, res) {
    const property = await propertiesService.approve(req.params.id, actorFromRequest(req), req.body?.note || null);
    return sendSuccess(res, { property });
  },

  async reject(req, res) {
    const property = await propertiesService.reject(req.params.id, actorFromRequest(req), req.body.reason);
    return sendSuccess(res, { property });
  },

  async adminArchive(req, res) {
    const property = await propertiesService.archive(req.params.id, actorFromRequest(req), req.body?.reason || null);
    return sendSuccess(res, { property });
  },

  async unarchive(req, res) {
    const property = await propertiesService.unarchive(req.params.id, actorFromRequest(req), req.body?.reason || null);
    return sendSuccess(res, { property });
  },

  async listAllLifecycleRequests(req, res) {
    const result = await propertiesService.listAllLifecycleRequests(req.query, actorFromRequest(req));
    return sendSuccess(res, result);
  },

  async getLifecycleRequest(req, res) {
    const request = await propertiesService.getLifecycleRequest(req.params.id, actorFromRequest(req));
    return sendSuccess(res, { request });
  },

  async approveLifecycleRequest(req, res) {
    const result = await propertiesService.reviewLifecycleRequest(
      req.params.id,
      'approve',
      actorFromRequest(req),
      req.body || {}
    );
    return sendSuccess(res, { request: result.request, property: result.property });
  },

  async rejectLifecycleRequest(req, res) {
    const result = await propertiesService.reviewLifecycleRequest(
      req.params.id,
      'reject',
      actorFromRequest(req),
      req.body || {}
    );
    return sendSuccess(res, { request: result.request, property: result.property });
  },

  async listAllChangeRequests(req, res) {
    const result = await propertiesService.listChangeRequests(null, req.query);
    return sendSuccess(res, result);
  },

  async getChangeRequest(req, res) {
    const result = await propertiesService.getChangeRequest(req.params.id);
    return sendSuccess(res, { request: result });
  },

  async approveChangeRequest(req, res) {
    const property = await propertiesService.reviewChangeRequest(
      req.params.id,
      'approve',
      actorFromRequest(req),
      req.body?.note || null
    );
    return sendSuccess(res, { property });
  },

  async rejectChangeRequest(req, res) {
    const request = await propertiesService.reviewChangeRequest(
      req.params.id,
      'reject',
      actorFromRequest(req),
      req.body?.reason || req.body?.note || null
    );
    return sendSuccess(res, { request });
  },

  async listDuplicates(req, res) {
    const result = await propertiesService.listDuplicates(req.query);
    return sendSuccess(res, result);
  },

  async confirmDuplicate(req, res) {
    const flag = await propertiesService.reviewDuplicate(
      req.params.id,
      'confirm',
      actorFromRequest(req),
      req.body?.note || null
    );
    return sendSuccess(res, { flag });
  },

  async dismissDuplicate(req, res) {
    const flag = await propertiesService.reviewDuplicate(
      req.params.id,
      'dismiss',
      actorFromRequest(req),
      req.body?.note || null
    );
    return sendSuccess(res, { flag });
  }
};

export default propertyController;
