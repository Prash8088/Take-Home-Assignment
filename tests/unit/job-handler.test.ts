jest.mock('../../src/config/database', () => ({ prisma: { processingJob: { update: jest.fn() } } }));
jest.mock('../../src/services/processing.service', () => ({ processMedia: jest.fn() }));

import { prisma } from '../../src/config/database';
import { handleAnalysisJob } from '../../src/queue/job-handler';
import { processMedia } from '../../src/services/processing.service';

const update = (prisma as unknown as { processingJob: { update: jest.Mock } }).processingJob.update;
const process = processMedia as jest.Mock;
const job = { id: 'job_1', attemptsMade: 0, data: { processingId: 'proc_1', mediaId: 'media_1' } };

describe('analysis job handler', () => {
  beforeEach(() => jest.clearAllMocks());
  it('processes a successful job', async () => {
    process.mockResolvedValue(undefined);
    await expect(handleAnalysisJob(job)).resolves.toBeUndefined();
    expect(process).toHaveBeenCalledWith('proc_1', 'media_1');
    expect(update).not.toHaveBeenCalled();
  });
  it('records a retryable failure and rethrows for BullMQ', async () => {
    process.mockRejectedValue(new Error('temporary issue'));
    await expect(handleAnalysisJob(job)).rejects.toThrow('temporary issue');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'pending', errorCode: 'RETRYING' }) }));
  });
  it('records a permanent failure on the final attempt', async () => {
    process.mockRejectedValue(new Error('decode failure'));
    await expect(handleAnalysisJob({ ...job, attemptsMade: 2 })).rejects.toThrow('decode failure');
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed', errorCode: 'IMAGE_PROCESSING_FAILED' }) }));
  });
});
