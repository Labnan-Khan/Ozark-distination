import { badRequest } from '../shared/errors/index.js';

export function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      const validated = {};
      for (const location of ['params', 'query', 'body']) {
        const schema = schemas[location];
        if (!schema) continue;
        const parsed = schema.safeParse(req[location]);
        if (!parsed.success) {
          const details = parsed.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message
          }));
          throw badRequest('Validation failed', details);
        }
        validated[location] = parsed.data;
        req[location] = parsed.data;
      }
      req.validated = { ...(req.validated || {}), ...validated };
      next();
    } catch (error) {
      next(error);
    }
  };
}
