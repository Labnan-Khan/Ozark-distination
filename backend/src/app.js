import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { appConfig } from './config/appConfig.js';
import routes from './routes/index.js';
import { requestContext, sendSuccess } from './middleware/requestContext.js';
import { requestLogger } from './infrastructure/logging/index.js';
import { globalLimiter } from './middleware/rateLimiter.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { registerInfrastructureHandlers } from './infrastructure/events/registerHandlers.js';

registerInfrastructureHandlers();

export const app = express();

app.set('trust proxy', appConfig.security.trustProxy);
app.disable('x-powered-by');

app.use(helmet());
app.use(cors({
  origin: appConfig.security.corsOrigin === '*' ? true : appConfig.security.corsOrigin.split(','),
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(requestContext);
app.use(requestLogger);
app.use(globalLimiter);

app.get('/', (_req, res) => sendSuccess(res, { service: 'property-rental-api', version: 'v1' }));
app.use(routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
