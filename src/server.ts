import { app } from './app';
import { env } from './config/env';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { analysisQueue } from './queue/analysis.queue';
import { logger } from './utils/logger';

const server = app.listen(env.PORT, '0.0.0.0', () =>
  logger.info({ port: env.PORT }, 'API listening')
);

async function close() {
  logger.info('Shutting down API');

  server.close();

  await analysisQueue.close();
  await redis.quit();
  await prisma.$disconnect();
}

process.on('SIGTERM', close);
process.on('SIGINT', close);