import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { NextFunction, Request, Response } from 'express';
import path from 'path';
import sharp from 'sharp';
import { prisma } from '../config/database';
import { env } from '../config/env';
import { analysisQueue } from '../queue/analysis.queue';
import { AppError } from '../utils/errors';
import { fileHash } from '../utils/hashing';

const allowedExtensions = new Set(['.jpg', '.jpeg', '.png', '.webp']);

function storedExtension(mimeType: string): string {
  return mimeType === 'image/png' ? '.png' : mimeType === 'image/webp' ? '.webp' : '.jpg';
}

async function removeFile(pathToRemove: string): Promise<void> {
  await fs.unlink(pathToRemove).catch(() => undefined);
}

export async function uploadMedia(request: Request, response: Response, next: NextFunction): Promise<void> {
  let storagePath: string | undefined;
  let persisted = false;
  try {
    const file = request.file;
    if (!file) throw new AppError(400, 'MISSING_FILE', 'Provide an image in multipart field "file".');
    if (!allowedExtensions.has(path.extname(file.originalname).toLowerCase())) {
      throw new AppError(400, 'INVALID_FILE_EXTENSION', 'Only JPEG, PNG and WebP extensions are supported.');
    }

    const mediaId = `media_${randomUUID()}`;
    const processingId = `proc_${randomUUID()}`;
    const storedFilename = `${mediaId}${storedExtension(file.mimetype)}`;
    await fs.mkdir(env.UPLOAD_DIR, { recursive: true });
    storagePath = path.resolve(env.UPLOAD_DIR, storedFilename);
    await fs.writeFile(storagePath, file.buffer);

    let metadata: sharp.Metadata;
    try {
      metadata = await sharp(storagePath, { failOn: 'error' }).metadata();
    } catch {
      throw new AppError(400, 'INVALID_IMAGE', 'The uploaded image is corrupted or unreadable.');
    }
    if (!metadata.width || !metadata.height || metadata.width < env.MIN_IMAGE_WIDTH || metadata.height < env.MIN_IMAGE_HEIGHT) {
      throw new AppError(400, 'INSUFFICIENT_DIMENSIONS', `Image must be at least ${env.MIN_IMAGE_WIDTH}x${env.MIN_IMAGE_HEIGHT}.`);
    }

    const hash = await fileHash(storagePath);
    const existing = await prisma.media.findUnique({ where: { fileHash: hash }, select: { id: true, jobs: { select: { id: true, status: true }, take: 1 } } });
    if (existing) {
      await removeFile(storagePath);
      storagePath = undefined;
      const job = existing.jobs[0];
      response.status(200).json({ mediaId: existing.id, processingId: job?.id, status: job?.status, idempotent: true });
      return;
    }

    await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      await transaction.media.create({ data: { id: mediaId, originalFilename: path.basename(file.originalname), storedFilename, storagePath: storagePath!, mimeType: file.mimetype, fileSize: file.size, width: metadata.width, height: metadata.height, fileHash: hash, metadata: metadata as object } });
      await transaction.processingJob.create({ data: { id: processingId, mediaId } });
    });
    persisted = true;
    try {
      await analysisQueue.add('analyze', { processingId, mediaId }, { jobId: processingId });
    } catch (error) {
      await prisma.processingJob.update({ where: { id: processingId }, data: { status: 'failed', errorCode: 'QUEUE_UNAVAILABLE', errorMessage: 'Could not schedule image processing.' } });
      throw new AppError(503, 'QUEUE_UNAVAILABLE', 'Image was stored but processing could not be scheduled.');
    }
    response.status(202).json({ processingId, mediaId, status: 'pending' });
  } catch (error) {
    if (storagePath && !persisted) await removeFile(storagePath);
    next(error);
  }
}

export async function status(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const processingId = request.params.processingId;
    if (typeof processingId !== 'string') throw new AppError(400, 'INVALID_PROCESSING_ID', 'Processing ID must be a single path value.');
    const job = await prisma.processingJob.findUnique({ where: { id: processingId } });
    if (!job) throw new AppError(404, 'PROCESSING_NOT_FOUND', 'Processing ID was not found.');
    response.json({ processingId: job.id, status: job.status, attempts: job.attempts, error: job.status === 'failed' ? { code: job.errorCode, message: job.errorMessage } : undefined });
  } catch (error) { next(error); }
}

export async function result(request: Request, response: Response, next: NextFunction): Promise<void> {
  try {
    const processingId = request.params.processingId;
    if (typeof processingId !== 'string') throw new AppError(400, 'INVALID_PROCESSING_ID', 'Processing ID must be a single path value.');
    const job = await prisma.processingJob.findUnique({ where: { id: processingId } });
    if (!job) throw new AppError(404, 'PROCESSING_NOT_FOUND', 'Processing ID was not found.');
    if (job.status === 'failed') { response.status(422).json({ processingId: job.id, status: 'failed', error: { code: job.errorCode, message: job.errorMessage } }); return; }
    if (job.status !== 'completed') { response.status(202).json({ processingId: job.id, status: job.status }); return; }
    const analysis = await prisma.analysisResult.findUnique({ where: { processingId: job.id } });
    response.json(analysis?.result);
  } catch (error) { next(error); }
}
