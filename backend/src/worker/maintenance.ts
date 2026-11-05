import { maintenanceQueue } from '../queue/queues.js';
import { logger } from '../lib/logger.js';
import { reconcile } from './reconcile.js';

export const TICK_MS = 60_000;

/**
 * Self-rescheduling delayed job (no cron, no setInterval). The job ID is derived from the target
 * minute (`maintenance-tick-<minute>`), so every process that tries to schedule "the next tick"
 * produces the same ID and BullMQ de-duplicates it: there is exactly one pending tick per minute.
 */
export async function scheduleNextTick(now = Date.now()): Promise<void> {
  const bucket = Math.floor(now / TICK_MS) + 1;
  await maintenanceQueue.add(
    'tick',
    {},
    {
      jobId: `maintenance-tick-${bucket}`,
      delay: Math.max(0, bucket * TICK_MS - now),
      removeOnComplete: { count: 20 },
      removeOnFail: { count: 50 },
      attempts: 1,
    },
  );
}

export async function processMaintenance(): Promise<void> {
  try {
    await reconcile();
  } finally {
    // Always chain the next tick, even if reconcile failed this time.
    await scheduleNextTick().catch((err) => logger.error({ err }, 'failed to schedule next maintenance tick'));
  }
}
