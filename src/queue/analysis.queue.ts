import { Queue } from 'bullmq'; import { redis } from '../config/redis'; import { env } from '../config/env';
export interface AnalysisJobData { processingId:string; mediaId:string; }
export const analysisQueue = new Queue<AnalysisJobData>('image-analysis',{connection:redis,defaultJobOptions:{attempts:env.MAX_JOB_ATTEMPTS,backoff:{type:'exponential',delay:1000},removeOnComplete:1000,removeOnFail:1000}});
