import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { redis } from '../queue/connection.js';
import { es } from '../modules/search/es.js';
import { scheduleNextTick } from '../worker/maintenance.js';
import { logger } from '../lib/logger.js';

async function check(fn: () => Promise<unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message.slice(0, 200) };
  }
}

export const healthRouter = Router();

healthRouter.get('/', async (_req, res) => {
  const [postgres, redisCheck, elasticsearch] = await Promise.all([
    check(() => prisma.$queryRaw`SELECT 1`),
    check(() => redis.ping()),
    check(() => es.ping()),
  ]);
  // Idempotent (deterministic job ID). If Redis was wiped (FLUSHALL), the maintenance chain is gone
  // too; any health probe re-seeds it and the next tick's reconcile rebuilds Redis from Postgres.
  if (redisCheck.ok) await scheduleNextTick().catch((err) => logger.warn({ err }, 'could not ensure maintenance tick'));
  // Elasticsearch is not on the critical path (sending never depends on it).
  const ok = postgres.ok && redisCheck.ok;
  res.status(ok ? 200 : 503).json({ ok, postgres, redis: redisCheck, elasticsearch });
});
