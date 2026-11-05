import { Router } from 'express';
import { prisma } from '../db/prisma.js';
import { redis } from '../queue/connection.js';
import { es } from '../modules/search/es.js';

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
  // Elasticsearch is not on the critical path (sending never depends on it).
  const ok = postgres.ok && redisCheck.ok;
  res.status(ok ? 200 : 503).json({ ok, postgres, redis: redisCheck, elasticsearch });
});
