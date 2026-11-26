import { sendSuccess } from '../../middleware/requestContext.js';
import { adminService } from './admin.service.js';

function validated(req, location) {
  return req.validated?.[location] ?? req[location] ?? {};
}

function requestMeta(req) {
  return {
    ip: req.ip,
    userAgent: req.header('user-agent') || null,
    requestId: req.requestId,
    correlationId: req.correlationId
  };
}

export const adminController = {
  async listUsers(req, res) {
    const { items, meta } = await adminService.listUsers(validated(req, 'query'));
    return sendSuccess(res, { users: items }, meta);
  },

  async createAdmin(req, res) {
    const user = await adminService.createAdmin(validated(req, 'body'), req.user, requestMeta(req));
    return sendSuccess(res, { user }, undefined, 201);
  },

  async getUserById(req, res) {
    const user = await adminService.getUserById(req.params.id);
    return sendSuccess(res, { user });
  },

  async updateUserStatus(req, res) {
    const { accountStatus, reason } = validated(req, 'body');
    const user = await adminService.updateUserStatus(
      req.params.id,
      accountStatus,
      req.user,
      reason ?? null,
      requestMeta(req)
    );
    return sendSuccess(res, { user });
  },

  async directDelete(req, res) {
    const { reason } = validated(req, 'body');
    const { request } = await adminService.directDelete(
      req.params.id,
      req.user,
      reason,
      requestMeta(req)
    );
    return sendSuccess(res, { deletionRequest: request }, undefined, 202);
  },

  async listDeletionRequests(req, res) {
    const { items, meta } = await adminService.listDeletionRequests(validated(req, 'query'));
    return sendSuccess(res, { requests: items }, meta);
  },

  async approveDeletionRequest(req, res) {
    const { note } = validated(req, 'body');
    const request = await adminService.reviewDeletionRequest(
      req.params.id,
      'approve',
      req.user,
      note ?? null,
      requestMeta(req)
    );
    return sendSuccess(res, { request });
  },

  async rejectDeletionRequest(req, res) {
    const { note } = validated(req, 'body');
    const request = await adminService.reviewDeletionRequest(
      req.params.id,
      'reject',
      req.user,
      note,
      requestMeta(req)
    );
    return sendSuccess(res, { request });
  },

  async getAuditLogs(req, res) {
    const query = validated(req, 'query');
    const { items, meta } = await adminService.getAuditLogs(query, {
      page: query.page,
      limit: query.limit,
      sort: query.sort
    });
    return sendSuccess(res, { logs: items }, meta);
  },

  async getSettings(_req, res) {
    const settings = await adminService.getSettings();
    return sendSuccess(res, { settings });
  },

  async updateSetting(req, res) {
    const { value } = validated(req, 'body');
    const setting = await adminService.updateSetting(
      req.params.key,
      value,
      req.user,
      requestMeta(req)
    );
    return sendSuccess(res, { setting });
  },

  async bookingReport(req, res) {
    const { rows, meta } = await adminService.bookingReport(validated(req, 'query'));
    return sendSuccess(res, { rows }, meta);
  }
};
