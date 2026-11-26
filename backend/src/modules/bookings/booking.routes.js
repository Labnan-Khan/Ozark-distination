import { Router } from 'express';
import { z } from 'zod';
import { bookingController } from './booking.controller.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validateRequest.js';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { objectIdSchema } from '../../shared/validators/index.js';
import { PERMISSIONS } from '../../shared/constants/index.js';
import {
  approveSchema,
  bookingListQuerySchema,
  createBookingSchema,
  modifyDatesSchema,
  reasonSchema,
  rejectSchema,
  reviewCancellationSchema
} from './booking.validation.js';

const idParams = { params: z.object({ id: objectIdSchema }) };

const router = Router();
router.use(authenticate);

router.post('/', authorize(PERMISSIONS.BOOKING_CREATE_OWN), validate({ body: createBookingSchema }), asyncHandler(bookingController.create));
router.get('/me', authorize(PERMISSIONS.BOOKING_READ_OWN), validate({ query: bookingListQuerySchema }), asyncHandler(bookingController.listMine));
router.get('/owner', authorize(PERMISSIONS.BOOKING_READ_OWN_PROPERTY), validate({ query: bookingListQuerySchema }), asyncHandler(bookingController.listOwner));
router.patch('/:id/dates', authorize(PERMISSIONS.BOOKING_MODIFY_ANY), validate({ ...idParams, body: modifyDatesSchema }), asyncHandler(bookingController.modifyDates));
router.get('/:id', validate(idParams), asyncHandler(bookingController.getOne));
router.get('/:id/history', validate(idParams), asyncHandler(bookingController.history));
router.post('/:id/approve', authorize(PERMISSIONS.BOOKING_APPROVE_OWN_PROPERTY), validate({ ...idParams, body: approveSchema }), asyncHandler(bookingController.approve));
router.post('/:id/reject', authorize(PERMISSIONS.BOOKING_APPROVE_OWN_PROPERTY), validate({ ...idParams, body: rejectSchema }), asyncHandler(bookingController.reject));
router.post('/:id/cancellation-request', authorize(PERMISSIONS.BOOKING_CANCEL_OWN), validate({ ...idParams, body: reasonSchema }), asyncHandler(bookingController.requestCancellation));
router.post('/:id/cancel', authorize(PERMISSIONS.BOOKING_CANCEL_OWN_PROPERTY), validate({ ...idParams, body: reasonSchema }), asyncHandler(bookingController.cancel));
router.post('/:id/review-cancellation', authorize(PERMISSIONS.BOOKING_APPROVE_OWN_PROPERTY), validate({ ...idParams, body: reviewCancellationSchema }), asyncHandler(bookingController.reviewCancellation));
router.post('/:id/complete', authorize(PERMISSIONS.BOOKING_COMPLETE_OWN_PROPERTY), validate(idParams), asyncHandler(bookingController.complete));

export default router;

export const adminBookingRouter = Router();
adminBookingRouter.use(authenticate);
adminBookingRouter.get('/', authorize(PERMISSIONS.BOOKING_READ_ANY), validate({ query: bookingListQuerySchema }), asyncHandler(bookingController.listAll));
adminBookingRouter.post('/', authorize(PERMISSIONS.BOOKING_CREATE_ANY), validate({ body: createBookingSchema }), asyncHandler(bookingController.adminCreate));
adminBookingRouter.patch('/:id/dates', authorize(PERMISSIONS.BOOKING_MODIFY_ANY), validate({ ...idParams, body: modifyDatesSchema }), asyncHandler(bookingController.modifyDates));
