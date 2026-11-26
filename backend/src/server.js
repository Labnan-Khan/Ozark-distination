import { app } from './app.js';
import { appConfig } from './config/appConfig.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { logger } from './infrastructure/logging/index.js';

let server;

async function start() {
  await connectDatabase();
  server = app.listen(appConfig.apiPrefix ? Number(process.env.PORT || 5000) : 5000, () => {
    logger.info({ port: server.address().port }, 'API server listening');
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, 'shutting down');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch(async (error) => {
  logger.fatal({ err: error }, 'failed to start server');
  await disconnectDatabase();
  process.exit(1);
});
