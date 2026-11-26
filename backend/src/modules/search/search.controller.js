import { sendSuccess } from '../../middleware/requestContext.js';
import { normalizeSearchQuery } from './search.validation.js';
import { searchService } from './search.service.js';

function responseFilters(query) {
  const { page, limit, sort, ...filters } = query;
  return filters;
}

export const searchController = {
  async properties(req, res) {
    const query = normalizeSearchQuery(req.query);
    const { items, meta } = await searchService.search(query);
    return sendSuccess(res, {
      properties: items,
      items,
      meta,
      filters: responseFilters(query)
    });
  },

  async map(req, res) {
    const query = normalizeSearchQuery(req.query);
    const { items, meta } = await searchService.mapSearch(query);
    return sendSuccess(res, {
      properties: items,
      items,
      meta,
      filters: responseFilters(query)
    });
  }
};
