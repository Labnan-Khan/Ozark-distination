import { bookingsService } from './booking.service.js';
import { sendSuccess } from '../../middleware/requestContext.js';

function actorFrom(req) {
  return {
    ...req.user.toObject(),
    correlationId: req.correlationId,
    ip: req.ip,
    userAgent: req.header('user-agent')
  };
}

export const bookingController = {
  async create(req, res) {
    const booking = await bookingsService.create(req.body, actorFrom(req), { correlationId: req.correlationId });
    return sendSuccess(res, { booking }, undefined, 201);
  },

  async listMine(req, res) {
    const result = await bookingsService.listForCustomer(req.user._id, req.query);
    return sendSuccess(res, { bookings: result.items }, result.meta);
  },

  async listOwner(req, res) {
    const result = await bookingsService.listForOwner(req.user._id, req.query);
    return sendSuccess(res, { bookings: result.items }, result.meta);
  },

  async listAll(req, res) {
    const result = await bookingsService.listAll(req.query);
    return sendSuccess(res, { bookings: result.items }, result.meta);
  },

  async getOne(req, res) {
    const booking = await bookingsService.getById(req.params.id, actorFrom(req));
    return sendSuccess(res, { booking });
  },

  async history(req, res) {
    const events = await bookingsService.getHistory(req.params.id, actorFrom(req));
    return sendSuccess(res, { events });
  },

  async approve(req, res) {
    const booking = await bookingsService.approve(req.params.id, actorFrom(req), req.body.note || null);
    return sendSuccess(res, { booking });
  },

  async reject(req, res) {
    const booking = await bookingsService.reject(req.params.id, actorFrom(req), req.body.reason);
    return sendSuccess(res, { booking });
  },

  async requestCancellation(req, res) {
    const booking = await bookingsService.requestCancellation(req.params.id, actorFrom(req), req.body.reason);
    return sendSuccess(res, { booking }, undefined, 202);
  },

  async reviewCancellation(req, res) {
    const booking = await bookingsService.reviewCancellation(
      req.params.id,
      req.body.decision,
      actorFrom(req),
      req.body.note || null
    );
    return sendSuccess(res, { booking });
  },

  async cancel(req, res) {
    const booking = await bookingsService.cancel(req.params.id, actorFrom(req), req.body.reason);
    return sendSuccess(res, { booking });
  },

  async complete(req, res) {
    const booking = await bookingsService.complete(req.params.id, actorFrom(req));
    return sendSuccess(res, { booking });
  },

  async modifyDates(req, res) {
    const booking = await bookingsService.modifyDates(req.params.id, req.body, actorFrom(req));
    return sendSuccess(res, { booking });
  },

  async adminCreate(req, res) {
    const booking = await bookingsService.create(req.body, actorFrom(req), { correlationId: req.correlationId });
    return sendSuccess(res, { booking }, undefined, 201);
  }
};
