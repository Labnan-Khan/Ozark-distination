import mongoose from 'mongoose';
import { env } from './environment.js';
import { logger } from '../infrastructure/logging/index.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri = env.MONGODB_URI) {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  await mongoose.connect(uri, {
    dbName: env.MONGODB_DB || undefined,
    maxPoolSize: 20,
    minPoolSize: 2,
    serverSelectionTimeoutMS: 10000
  });
  logger.info('MongoDB connected');
  return mongoose.connection;
}

export async function disconnectDatabase() {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    logger.info('MongoDB disconnected');
  }
}

export async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

export const db = mongoose.connection;
