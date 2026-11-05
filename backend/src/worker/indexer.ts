import type { Job } from 'bullmq';
import type { IndexJobData } from '../queue/queues.js';
import { indexEmail } from '../modules/search/indexing.js';

/** Reload the latest row and upsert it. Out-of-order jobs are harmless: last state wins. */
export async function processIndexJob(job: Job<IndexJobData>): Promise<string> {
  return indexEmail(job.data.emailId);
}
