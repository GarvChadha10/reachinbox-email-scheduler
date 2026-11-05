import { Queue, type JobsOptions } from 'bullmq';
import { redis } from './connection.js';
import { logger } from '../lib/logger.js';

export const QUEUE_EMAILS = 'emails';
export const QUEUE_INDEXING = 'indexing';
export const QUEUE_MAINTENANCE = 'maintenance';

export interface EmailJobData {
  emailId: string;
}
export interface IndexJobData {
  emailId: string;
}

/** BullMQ custom job IDs may not contain ':' and may not be integer-like. */
export const emailJobId = (emailId: string) => `email-${emailId}`;
export const indexJobId = (emailId: string, updatedAt: Date) => `idx-${emailId}-${updatedAt.getTime()}`;
export const MAINTENANCE_JOB_ID = 'maintenance-tick';

export const emailJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 30_000 },
  // Never `true`: that frees the job ID immediately. The DB claim is the real duplicate guard anyway.
  removeOnComplete: { age: 86_400, count: 5_000 },
  removeOnFail: { age: 604_800 },
};

export const indexJobOptions: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { age: 3_600, count: 1_000 },
  removeOnFail: { age: 604_800 },
};

export const emailsQueue = new Queue<EmailJobData>(QUEUE_EMAILS, { connection: redis });
export const indexingQueue = new Queue<IndexJobData>(QUEUE_INDEXING, { connection: redis });
export const maintenanceQueue = new Queue(QUEUE_MAINTENANCE, { connection: redis });

for (const q of [emailsQueue, indexingQueue, maintenanceQueue]) {
  q.on('error', (err) => logger.error({ err, queue: q.name }, 'queue error'));
}

export async function closeQueues(): Promise<void> {
  await Promise.all([emailsQueue.close(), indexingQueue.close(), maintenanceQueue.close()]);
}
