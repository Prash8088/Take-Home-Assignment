import { promises as fs } from 'fs';
import path from 'path';
import request from 'supertest';
import sharp from 'sharp';

jest.mock('../../src/config/database', () => ({
  prisma: {
    media: { findUnique: jest.fn() },
    processingJob: { findUnique: jest.fn(), update: jest.fn() },
    analysisResult: { findUnique: jest.fn() },
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
  },
}));
jest.mock('../../src/config/redis', () => ({ redis: { ping: jest.fn(), quit: jest.fn() } }));
jest.mock('../../src/queue/analysis.queue', () => ({ analysisQueue: { add: jest.fn(), close: jest.fn() } }));

import { app } from '../../src/app';
import { prisma } from '../../src/config/database';
import { analysisQueue } from '../../src/queue/analysis.queue';

const db = prisma as unknown as {
  media: { findUnique: jest.Mock };
  processingJob: { findUnique: jest.Mock; update: jest.Mock };
  analysisResult: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};
const queue = analysisQueue as unknown as { add: jest.Mock };

const pendingJob = { id: 'proc_pending', status: 'pending', attempts: 0, errorCode: null, errorMessage: null };
const completedJob = { ...pendingJob, id: 'proc_complete', status: 'completed', attempts: 1 };
const failedJob = { ...pendingJob, id: 'proc_failed', status: 'failed', attempts: 3, errorCode: 'IMAGE_PROCESSING_FAILED', errorMessage: 'Unable to decode image' };

describe('media API', () => {
  beforeAll(async () => { await fs.rm('.test-uploads', { recursive: true, force: true }); });
  afterAll(async () => { await fs.rm('.test-uploads', { recursive: true, force: true }); });
  beforeEach(() => {
    jest.clearAllMocks();
    db.media.findUnique.mockResolvedValue(null);
    db.$transaction.mockImplementation(async (callback: (transaction: unknown) => Promise<void>) => callback({ media: { create: jest.fn() }, processingJob: { create: jest.fn() } }));
    queue.add.mockResolvedValue({ id: 'job_1' });
  });

  it('accepts a valid image and queues a processing job', async () => {
    const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const response = await request(app).post('/api/v1/media').attach('file', image, { filename: 'vehicle.jpeg', contentType: 'image/jpeg' }).expect(202);
    expect(response.body).toMatchObject({ status: 'pending' });
    expect(response.body.processingId).toMatch(/^proc_/);
    expect(queue.add).toHaveBeenCalledWith('analyze', expect.objectContaining({ processingId: response.body.processingId }), expect.objectContaining({ jobId: response.body.processingId }));
    await fs.unlink(path.join('.test-uploads', `${response.body.mediaId}.jpg`));
  });

  it('rejects a request without a file', async () => {
    const response = await request(app).post('/api/v1/media').expect(400);
    expect(response.body.error.code).toBe('MISSING_FILE');
  });

  it('rejects an unsupported MIME type', async () => {
    const response = await request(app).post('/api/v1/media').attach('file', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' }).expect(400);
    expect(response.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects an oversized file before image decoding', async () => {
    const response = await request(app).post('/api/v1/media').attach('file', Buffer.alloc(10 * 1024 * 1024 + 1), { filename: 'large.jpg', contentType: 'image/jpeg' }).expect(400);
    expect(response.body.error.code).toBe('FILE_TOO_LARGE');
  });

  it('records a failed job when queueing fails after persistence', async () => {
    queue.add.mockRejectedValueOnce(new Error('Redis unavailable'));
    const image = await sharp({ create: { width: 400, height: 300, channels: 3, background: '#336699' } }).jpeg().toBuffer();
    const response = await request(app).post('/api/v1/media').attach('file', image, { filename: 'vehicle.jpeg', contentType: 'image/jpeg' }).expect(503);
    expect(response.body.error.code).toBe('QUEUE_UNAVAILABLE');
    expect(db.processingJob.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed', errorCode: 'QUEUE_UNAVAILABLE' }) }));
  });

  it.each([['proc_pending', pendingJob], ['proc_complete', completedJob], ['proc_failed', failedJob]])('returns public status for %s', async (processingId, job) => {
    db.processingJob.findUnique.mockResolvedValue(job);
    const response = await request(app).get(`/api/v1/media/${processingId}/status`).expect(200);
    expect(response.body.status).toBe(job.status);
  });

  it('returns 202 while a result is pending', async () => {
    db.processingJob.findUnique.mockResolvedValue(pendingJob);
    await request(app).get('/api/v1/media/proc_pending/result').expect(202);
  });

  it('returns a structured completed result', async () => {
    db.processingJob.findUnique.mockResolvedValue(completedJob);
    db.analysisResult.findUnique.mockResolvedValue({ result: { processingId: 'proc_complete', status: 'completed', overallRisk: 'low', checks: {} } });
    const response = await request(app).get('/api/v1/media/proc_complete/result').expect(200);
    expect(response.body.overallRisk).toBe('low');
  });

  it('returns a failure response after permanent processing failure', async () => {
    db.processingJob.findUnique.mockResolvedValue(failedJob);
    const response = await request(app).get('/api/v1/media/proc_failed/result').expect(422);
    expect(response.body.error.code).toBe('IMAGE_PROCESSING_FAILED');
  });
});
