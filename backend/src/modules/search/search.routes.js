import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { validate } from '../../middleware/validateRequest.js';
import { searchController } from './search.controller.js';
import { mapSearchQuerySchema, searchPropertiesQuerySchema } from './search.validation.js';

const router = Router();

router.get('/search/properties', validate({ query: searchPropertiesQuerySchema }), asyncHandler(searchController.properties));
router.get('/search/map', validate({ query: mapSearchQuerySchema }), asyncHandler(searchController.map));

export default router;
