import { Worker } from 'bullmq';
import { prisma } from '../config/database';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { handleAnalysisJob } from './job-handler';
import { logger } from '../utils/logger';

const worker = new Worker('image-analysis', handleAnalysisJob, { connection: redis, concurrency: env.WORKER_CONCURRENCY });
async function close(): Promise<void> {
  logger.info('Shutting down worker');
  await worker.close();
  await redis.quit();
  await prisma.$disconnect();
}
process.on('SIGTERM', close);
process.on('SIGINT', close);
