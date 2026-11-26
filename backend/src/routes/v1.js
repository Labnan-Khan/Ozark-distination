import { Router } from 'express';
import { routes as authRoutes } from '../modules/auth/index.js';
import { routes as userRoutes } from '../modules/users/index.js';
import { routes as propertiesRoutes, adminRoutes as propertyAdminRoutes } from '../modules/properties/index.js';
import { routes as bookingRoutes, adminBookingRouter } from '../modules/bookings/index.js';
import { routes as categoryRoutes } from '../modules/categories/index.js';
import { routes as amenityRoutes } from '../modules/amenities/index.js';
import { routes as favoriteRoutes } from '../modules/favorites/index.js';
import { routes as notificationRoutes } from '../modules/notifications/index.js';
import { routes as mediaRoutes } from '../modules/media/index.js';
import { routes as adminRoutes } from '../modules/admin/index.js';
import { routes as searchRoutes } from '../modules/search/index.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/properties', propertiesRoutes);
router.use('/admin/properties', propertyAdminRoutes);
router.use('/bookings', bookingRoutes);
router.use('/admin/bookings', adminBookingRouter);
router.use('/favorites', favoriteRoutes);
router.use('/notifications', notificationRoutes);
router.use('/media', mediaRoutes);
router.use('/admin', adminRoutes);

// These routers declare their full public/admin paths, so they mount at the API root.
router.use('/', categoryRoutes);
router.use('/', amenityRoutes);
router.use('/', searchRoutes);

export default router;
