import { Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../db/prisma.js';
import { createRedis, redis } from '../queue/connection.js';
import { closeQueues, QUEUE_EMAILS, QUEUE_INDEXING, QUEUE_MAINTENANCE, type EmailJobData, type IndexJobData } from '../queue/queues.js';
import { closeTransports } from '../mail/transport.js';
import { ensureSenders } from '../modules/senders/senders.service.js';
import { ensureEmailIndex, es } from '../modules/search/es.js';
import { processEmail } from './processEmail.js';
import { processIndexJob } from './indexer.js';
import { processMaintenance, scheduleNextTick } from './maintenance.js';
import { reconcile } from './reconcile.js';

async function main() {
  await ensureSenders();
  await ensureEmailIndex().catch((err) => logger.warn({ err: (err as Error).message }, 'Elasticsearch unavailable; indexing will retry'));

  // Repair state before consuming jobs, then make sure the maintenance chain exists.
  await reconcile();
  await scheduleNextTick();

  const emailWorker = new Worker<EmailJobData>(QUEUE_EMAILS, (job, token) => processEmail(job, token), {
    connection: createRedis(),
    concurrency: env.WORKER_CONCURRENCY,
    lockDuration: 60_000,
    maxStalledCount: 1,
  });
  const indexWorker = new Worker<IndexJobData>(QUEUE_INDEXING, processIndexJob, { connection: createRedis(), concurrency: 10 });
  const maintenanceWorker = new Worker(QUEUE_MAINTENANCE, processMaintenance, { connection: createRedis(), concurrency: 1 });
  const workers = [emailWorker, indexWorker, maintenanceWorker];

  for (const w of workers) {
    w.on('error', (err) => logger.error({ err, queue: w.name }, 'worker error'));
    w.on('failed', (job, err) => logger.warn({ queue: w.name, jobId: job?.id, err: err.message, attempts: job?.attemptsMade }, 'job failed'));
    w.on('stalled', (jobId) => logger.warn({ queue: w.name, jobId }, 'job stalled'));
  }

  // A Redis restart/failover that lost data is detected when the connection comes back.
  let firstReady = true;
  redis.on('ready', () => {
    if (firstReady) {
      firstReady = false;
      return;
    }
    logger.info('redis reconnected: reconciling');
    reconcile()
      .then(() => scheduleNextTick())
      .catch((err) => logger.error({ err }, 'reconcile after reconnect failed'));
  });

  logger.info({ pid: process.pid, concurrency: env.WORKER_CONCURRENCY }, 'worker started');

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'worker shutting down: waiting for active jobs');
    await Promise.all(workers.map((w) => w.close()));
    await closeQueues();
    closeTransports();
    await Promise.allSettled([redis.quit(), prisma.$disconnect(), es.close()]);
    logger.info('worker stopped');
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'worker failed to start');
  process.exit(1);
});
