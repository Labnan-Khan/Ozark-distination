import { connectDatabase, disconnectDatabase } from '../../config/database.js';
import { env, isTest } from '../../config/environment.js';
import { registerInfrastructureHandlers } from '../events/registerHandlers.js';
import { eventBus } from '../events/index.js';
import { logger } from '../logging/index.js';
import { sleep } from '../../shared/utils/index.js';

let running = false;

export async function startWorker() {
  if (running) return;
  running = true;
  await connectDatabase();
  registerInfrastructureHandlers();
  logger.info('Event worker started');

  while (running) {
    try {
      const processed = await eventBus.dispatchPending({ limit: env.WORKER_BATCH_SIZE });
      if (processed === 0) await sleep(env.WORKER_POLL_MS);
    } catch (error) {
      logger.error({ err: error }, 'worker dispatch failed');
      await sleep(env.WORKER_POLL_MS);
    }
    if (isTest) break;
  }
}

export async function stopWorker() {
  running = false;
}

if (process.argv[1]?.endsWith('worker.js')) {
  startWorker().catch(async (error) => {
    logger.fatal({ err: error }, 'worker failed to start');
    await disconnectDatabase();
    process.exit(1);
  });

  process.on('SIGTERM', async () => {
    await stopWorker();
    await disconnectDatabase();
    process.exit(0);
  });
}
