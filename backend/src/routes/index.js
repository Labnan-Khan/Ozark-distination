import { Router } from 'express';
import { appConfig } from '../config/appConfig.js';
import v1Routes from './v1.js';

const router = Router();

router.get('/health/live', (_req, res) => res.status(200).json({ status: 'ok' }));
router.get('/health/ready', (_req, res) => res.status(200).json({ status: 'ready' }));
router.use(appConfig.apiPrefix, v1Routes);

export default router;
