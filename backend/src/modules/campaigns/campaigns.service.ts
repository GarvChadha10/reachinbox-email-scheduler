import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../db/prisma.js';
import { env } from '../../config/env.js';
import { badRequest } from '../../lib/errors.js';
import { normalizeRecipients } from '../../lib/emailAddress.js';
import { planSchedule } from '../../scheduler/planner.js';
import { emailJobId, emailJobOptions, emailsQueue } from '../../queue/queues.js';
import { enqueueIndex } from '../search/indexing.js';
import { listActiveSenders } from '../senders/senders.service.js';
import { logger } from '../../lib/logger.js';
import type { CreateCampaignInput } from './campaigns.schema.js';

const CHUNK = 500;

export interface CreateCampaignResult {
  replayed: boolean;
  payload: {
    campaign: {
      id: string;
      subject: string;
      startAt: string;
      delayMs: number;
      hourlyLimit: number;
      totalCount: number;
      createdAt: string;
    };
    effective: { delayMs: number; hourlyLimit: number };
    clamped: { delayMs: boolean; hourlyLimit: boolean };
    scheduledCount: number;
    invalidCount: number;
    duplicatesRemoved: number;
    firstScheduledAt: string | null;
    lastScheduledAt: string | null;
  };
}

export function effectiveSettings(delayMs: number, hourlyLimit: number) {
  const eDelay = Math.max(env.MIN_DELAY_BETWEEN_EMAILS_MS, delayMs);
  const eHourly = Math.min(env.MAX_EMAILS_PER_HOUR_PER_SENDER, hourlyLimit);
  return { delayMs: eDelay, hourlyLimit: eHourly, clamped: { delayMs: eDelay !== delayMs, hourlyLimit: eHourly !== hourlyLimit } };
}

async function buildPayload(
  campaignId: string,
  input: CreateCampaignInput,
  norm: { invalidCount: number; duplicatesRemoved: number },
): Promise<CreateCampaignResult['payload']> {
  const c = await prisma.campaign.findUniqueOrThrow({ where: { id: campaignId } });
  const agg = await prisma.email.aggregate({
    where: { campaignId },
    _min: { scheduledAt: true },
    _max: { scheduledAt: true },
    _count: true,
  });
  return {
    campaign: {
      id: c.id,
      subject: c.subject,
      startAt: c.startAt.toISOString(),
      delayMs: c.delayMs,
      hourlyLimit: c.hourlyLimit,
      totalCount: c.totalCount,
      createdAt: c.createdAt.toISOString(),
    },
    effective: { delayMs: c.delayMs, hourlyLimit: c.hourlyLimit },
    clamped: { delayMs: c.delayMs !== input.delayMs, hourlyLimit: c.hourlyLimit !== input.hourlyLimit },
    scheduledCount: agg._count,
    invalidCount: norm.invalidCount,
    duplicatesRemoved: norm.duplicatesRemoved,
    firstScheduledAt: agg._min.scheduledAt?.toISOString() ?? null,
    lastScheduledAt: agg._max.scheduledAt?.toISOString() ?? null,
  };
}

/** Enqueue one delayed job per email (deterministic IDs => idempotent), then mark rows queued. */
export async function enqueueEmails(rows: ReadonlyArray<{ id: string; scheduledAt: Date }>, now = Date.now()): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await emailsQueue.addBulk(
      chunk.map((r) => ({
        name: 'send',
        data: { emailId: r.id },
        opts: { ...emailJobOptions, jobId: emailJobId(r.id), delay: Math.max(0, r.scheduledAt.getTime() - now) },
      })),
    );
    await prisma.email.updateMany({ where: { id: { in: chunk.map((r) => r.id) }, queued: false }, data: { queued: true } });
  }
}

export async function createCampaign(userId: string, idempotencyKey: string, input: CreateCampaignInput): Promise<CreateCampaignResult> {
  const norm = normalizeRecipients(input.recipients);

  const existing = await prisma.campaign.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
  if (existing) return { replayed: true, payload: await buildPayload(existing.id, input, norm) };

  if (norm.valid.length === 0) throw badRequest('No valid recipient email addresses');
  if (norm.valid.length > env.MAX_RECIPIENTS_PER_CAMPAIGN) {
    throw badRequest(`Too many recipients: ${norm.valid.length} > ${env.MAX_RECIPIENTS_PER_CAMPAIGN}`);
  }

  const pool = await listActiveSenders();
  const senders = input.senderId ? pool.filter((s) => s.id === input.senderId) : pool;
  if (input.senderId && senders.length === 0) throw badRequest('Unknown or inactive sender');
  if (senders.length === 0) throw badRequest('No active senders available');

  const eff = effectiveSettings(input.delayMs, input.hourlyLimit);
  const now = Date.now();
  const plan = planSchedule({
    recipients: norm.valid,
    senderIds: senders.map((s) => s.id),
    startAt: new Date(input.startAt).getTime(),
    delayMs: eff.delayMs,
    hourlyLimit: eff.hourlyLimit,
    now,
  });

  const campaignId = randomUUID();
  const createdAt = new Date();
  const rows = plan.map((p) => ({
    id: randomUUID(),
    campaignId,
    userId,
    senderId: p.senderId,
    recipientEmail: p.recipient,
    status: 'scheduled',
    scheduledAt: new Date(p.scheduledAt),
    plannedIndex: p.plannedIndex,
    createdAt,
    updatedAt: createdAt,
  }));

  // Step 1: one transaction for the campaign and every email row (queued=false).
  try {
    await prisma.$transaction(async (tx) => {
      await tx.campaign.create({
        data: {
          id: campaignId,
          userId,
          idempotencyKey,
          subject: input.subject,
          body: input.body,
          startAt: new Date(Math.max(new Date(input.startAt).getTime(), now)),
          delayMs: eff.delayMs,
          hourlyLimit: eff.hourlyLimit,
          totalCount: rows.length,
        },
      });
      for (let i = 0; i < rows.length; i += 5000) {
        await tx.email.createMany({ data: rows.slice(i, i + 5000) });
      }
    }, { timeout: 60_000 });
  } catch (err) {
    // Concurrent request with the same Idempotency-Key won the race: return its campaign.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      const winner = await prisma.campaign.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey } } });
      if (winner) return { replayed: true, payload: await buildPayload(winner.id, input, norm) };
    }
    throw err;
  }

  // Steps 2+3: enqueue after commit, then mark queued. A crash here is repaired by reconcile().
  await enqueueEmails(rows, Date.now());
  await enqueueIndex(rows);
  logger.info({ campaignId, count: rows.length, effective: eff }, 'campaign scheduled');

  return { replayed: false, payload: await buildPayload(campaignId, input, norm) };
}
