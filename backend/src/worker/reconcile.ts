import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { redis } from '../queue/connection.js';
import { logger } from '../lib/logger.js';
import { emailJobId, emailsQueue } from '../queue/queues.js';
import { enqueueEmails } from '../modules/campaigns/campaigns.service.js';
import { enqueueIndex } from '../modules/search/indexing.js';

export const REDIS_EPOCH_KEY = 'sys:redis_epoch';
const BATCH = 2000;
const OVERDUE_GRACE_MS = 5 * 60_000;

export interface ReconcileReport {
  requeuedUnqueued: number;
  redisWiped: boolean;
  requeuedAfterWipe: number;
  requeuedOrphans: number;
  reapedSending: number;
}

async function requeueWhere(where: Prisma.EmailWhereInput): Promise<number> {
  let n = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.email.findMany({
      where,
      select: { id: true, scheduledAt: true },
      orderBy: { id: 'asc' },
      take: BATCH,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    await enqueueEmails(rows);
    n += rows.length;
    cursor = rows[rows.length - 1]!.id;
  }
  return n;
}

/**
 * Rebuild Redis state from Postgres. Safe to run concurrently and repeatedly: job IDs are
 * deterministic and every DB update is guarded.
 */
export async function reconcile(): Promise<ReconcileReport> {
  const report: ReconcileReport = { requeuedUnqueued: 0, redisWiped: false, requeuedAfterWipe: 0, requeuedOrphans: 0, reapedSending: 0 };

  // (a) Rows committed but never enqueued (API crashed between commit and enqueue).
  report.requeuedUnqueued = await requeueWhere({ status: 'scheduled', queued: false });

  // (b) Redis wiped? The sentinel disappears together with every job.
  const epoch = await redis.get(REDIS_EPOCH_KEY);
  if (!epoch) {
    const scheduled = await prisma.email.count({ where: { status: 'scheduled' } });
    if (scheduled > 0) {
      report.redisWiped = true;
      report.requeuedAfterWipe = await requeueWhere({ status: 'scheduled' });
    }
    await redis.set(REDIS_EPOCH_KEY, new Date().toISOString());
  }

  // (c) Overdue 'scheduled' rows whose job is missing or dead (e.g. failed on an infra error).
  const overdue = await prisma.email.findMany({
    where: { status: 'scheduled', queued: true, scheduledAt: { lt: new Date(Date.now() - OVERDUE_GRACE_MS) } },
    select: { id: true, scheduledAt: true },
    orderBy: { scheduledAt: 'asc' },
    take: 500,
  });
  const orphans: typeof overdue = [];
  for (const row of overdue) {
    const job = await emailsQueue.getJob(emailJobId(row.id));
    const state = job ? await job.getState() : 'missing';
    if (state === 'missing' || state === 'unknown' || state === 'failed' || state === 'completed') {
      if (job) await job.remove().catch(() => undefined);
      orphans.push(row);
    }
  }
  if (orphans.length) {
    await enqueueEmails(orphans);
    report.requeuedOrphans = orphans.length;
  }

  // (d) At-most-once fail-safe: rows stuck in 'sending' beyond the lease are NOT resent.
  const reaped = await prisma.$queryRaw<{ id: string; updated_at: Date }[]>(Prisma.sql`
    UPDATE emails
       SET status = 'failed', failure_reason = 'interrupted_unconfirmed', processed_at = now(), updated_at = now(),
           last_error = 'Worker stopped after claiming; delivery could not be confirmed'
     WHERE status = 'sending' AND sending_started_at < now() - make_interval(secs => ${env.SENDING_LEASE_MS / 1000})
     RETURNING id, updated_at`);
  report.reapedSending = reaped.length;
  if (reaped.length) await enqueueIndex(reaped.map((r) => ({ id: r.id, updatedAt: r.updated_at })));

  const changed = report.requeuedUnqueued + report.requeuedAfterWipe + report.requeuedOrphans + report.reapedSending;
  if (changed > 0 || report.redisWiped) logger.info(report, 'reconcile repaired state');
  else logger.debug(report, 'reconcile: nothing to do');
  return report;
}
