import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { prisma } from '../db/prisma.js';
import { redis } from '../queue/connection.js';
import { closeQueues } from '../queue/queues.js';
import { ensureSenders } from '../modules/senders/senders.service.js';
import { ensureEmailIndex, es } from '../modules/search/es.js';
import { scheduleNextTick } from '../worker/maintenance.js';
import { createApp } from './app.js';

async function main() {
  await ensureSenders();
  await ensureEmailIndex().catch((err) => logger.warn({ err: (err as Error).message }, 'Elasticsearch unavailable at boot'));
  // Idempotent (deterministic job ID): makes sure the self-rescheduling maintenance chain exists.
  await scheduleNextTick();

  const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, 'API listening'));

  const shutdown = (signal: string) => {
    logger.info({ signal }, 'API shutting down');
    server.close(async () => {
      await closeQueues();
      await Promise.allSettled([redis.quit(), prisma.$disconnect(), es.close()]);
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.fatal({ err }, 'API failed to start');
  process.exit(1);
});
