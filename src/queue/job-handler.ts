import { prisma } from '../config/database';
import { env } from '../config/env';
import { processMedia } from '../services/processing.service';
import { logger } from '../utils/logger';
import { AnalysisJobData } from './analysis.queue';

export interface AnalysisJob {
  id?: string | number;
  attemptsMade: number;
  data: AnalysisJobData;
}

export async function handleAnalysisJob(job: AnalysisJob): Promise<void> {
  const startedAt = Date.now();
  try {
    await processMedia(job.data.processingId, job.data.mediaId);
    logger.info({ processingId: job.data.processingId, jobId: job.id, durationMs: Date.now() - startedAt }, 'Image analysis completed');
  } catch (error) {
    const finalAttempt = job.attemptsMade + 1 >= env.MAX_JOB_ATTEMPTS;
    await prisma.processingJob.update({
      where: { id: job.data.processingId },
      data: finalAttempt
        ? { status: 'failed', errorCode: 'IMAGE_PROCESSING_FAILED', errorMessage: error instanceof Error ? error.message : 'Unknown failure', completedAt: new Date() }
        : { status: 'pending', errorCode: 'RETRYING', errorMessage: 'Temporary processing failure; retry scheduled.' },
    });
    throw error;
  }
}
