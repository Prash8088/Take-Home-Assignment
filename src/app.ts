import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import { prisma } from './config/database';
import { redis } from './config/redis';
import { errorHandler } from './utils/errors';
import { logger } from './utils/logger';
import { requestId } from './middleware/request-id.middleware';
import { uploadError } from './middleware/upload.middleware';
import { mediaRouter } from './routes/media.routes';

export const app = express();
app.use(requestId);
app.use(pinoHttp({ logger, genReqId: request => request.id }));
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? '*' }));
app.use(rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }));
app.get('/health', (_request, response) => response.json({ status: 'ok' }));
app.get('/health/ready', async (request, response) => {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()]);
    response.json({ status: 'ok' });
  } catch (error) {
    request.log.warn({ error }, 'Readiness check failed');
    response.status(503).json({ status: 'unavailable' });
  }
});
app.use('/api/v1/media', mediaRouter);
app.use(uploadError);
app.use(errorHandler);
