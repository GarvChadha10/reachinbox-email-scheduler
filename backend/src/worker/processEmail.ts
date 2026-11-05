import { DelayedError, UnrecoverableError, type Job } from 'bullmq';
import nodemailer from 'nodemailer';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { redis } from '../queue/connection.js';
import { logger } from '../lib/logger.js';
import { reserveSlot } from '../ratelimit/reserveSlot.js';
import { getTransport } from '../mail/transport.js';
import { classifySmtpError, type SmtpLikeError } from '../mail/classifyError.js';
import { enqueueIndex } from '../modules/search/indexing.js';
import { notifyRateLimitHit } from '../modules/slack/slack.service.js';
import type { EmailJobData } from '../queue/queues.js';
import { claimEmail, deferEmail, markFailed, markSent, releaseForRetry } from './emailState.js';

/** If the reserved slot is further away than this, park the job in the delayed set instead of sleeping. */
const MAX_IN_PROCESS_WAIT_MS = 60_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 1000);

function htmlBody(text: string): string {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5">${esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>`;
}

async function reindex(emailId: string, updatedAt: Date | null) {
  if (updatedAt) await enqueueIndex([{ id: emailId, updatedAt }]).catch((err) => logger.warn({ err, emailId }, 'index enqueue failed'));
}

export type ProcessOutcome = 'skipped' | 'deferred' | 'sent' | 'parked';

export async function processEmail(job: Job<EmailJobData>, token?: string): Promise<ProcessOutcome> {
  const { emailId } = job.data;
  const log = logger.child({ emailId, jobId: job.id });

  // 1. Always reload from Postgres; job data is just a pointer. Cheap no-op for stale/duplicate jobs.
  const email = await prisma.email.findUnique({
    where: { id: emailId },
    include: { campaign: true, sender: true },
  });
  if (!email || email.status !== 'scheduled') {
    log.debug({ status: email?.status }, 'skip: not scheduled');
    return 'skipped';
  }

  // 2. Reserve a per-sender slot (hourly caps + min delay), atomically across all workers.
  const now = Date.now();
  const res = await reserveSlot(redis, {
    senderId: email.senderId,
    campaignId: email.campaignId,
    now,
    delayMs: Math.max(env.MIN_DELAY_BETWEEN_EMAILS_MS, email.campaign.delayMs),
    senderCap: env.MAX_EMAILS_PER_HOUR_PER_SENDER,
    campaignCap: Math.min(env.MAX_EMAILS_PER_HOUR_PER_SENDER, email.campaign.hourlyLimit),
  });

  if (res.kind === 'LIMIT') {
    // Never drop or fail: move into the next window; the offset keeps campaign order where possible.
    const next = res.windowEndMs + (email.plannedIndex % 1000);
    const updatedAt = await deferEmail(emailId, new Date(next));
    log.info({ scope: res.scope, until: new Date(next).toISOString() }, 'hourly limit hit: deferred');
    void notifyRateLimitHit({
      userId: email.userId,
      senderId: email.senderId,
      senderEmail: email.sender.email,
      cap: res.scope === 'sender' ? env.MAX_EMAILS_PER_HOUR_PER_SENDER : email.campaign.hourlyLimit,
      scope: res.scope,
      windowEndMs: res.windowEndMs,
    });
    await reindex(emailId, updatedAt);
    await job.moveToDelayed(next, token);
    throw new DelayedError();
  }

  const wait = res.slotMs - Date.now();
  if (wait > MAX_IN_PROCESS_WAIT_MS) {
    // The reserved slot is far away (heavy contention); park instead of holding a concurrency slot.
    await job.moveToDelayed(res.slotMs, token);
    throw new DelayedError();
  }
  if (wait > 0) await sleep(wait);

  // 3. Atomic claim: exactly one worker can move scheduled -> sending.
  if (!(await claimEmail(emailId))) {
    log.info('skip: claim lost (already being sent or done)');
    return 'skipped';
  }

  // 4. Send.
  const messageId = `<email-${emailId}@${env.SENDER_DOMAIN}>`;
  try {
    const info = await getTransport(email.sender).sendMail({
      from: { name: email.sender.displayName, address: email.sender.email },
      to: email.recipientEmail,
      subject: email.campaign.subject,
      text: email.campaign.body,
      html: htmlBody(email.campaign.body),
      messageId,
    });
    // 5. Success.
    // The pool's SentMessageInfo carries the same envelope/response fields getTestMessageUrl reads.
    const preview = nodemailer.getTestMessageUrl(info as unknown as Parameters<typeof nodemailer.getTestMessageUrl>[0]);
    const updatedAt = await markSent(emailId, {
      messageId: info.messageId || messageId,
      response: String(info.response ?? '').slice(0, 500),
      previewUrl: preview || null,
    });
    log.info({ to: email.recipientEmail, sender: email.sender.email }, 'sent');
    await reindex(emailId, updatedAt);
    return 'sent';
  } catch (err) {
    // 6. Classify.
    const kind = classifySmtpError(err as SmtpLikeError);
    const msg = errText(err);
    if (kind === 'permanent') {
      await reindex(emailId, await markFailed(emailId, 'sending', 'permanent', msg));
      log.warn({ err: msg }, 'permanent SMTP failure');
      throw new UnrecoverableError(msg);
    }
    if (kind === 'ambiguous') {
      await reindex(emailId, await markFailed(emailId, 'sending', 'delivery_unconfirmed', msg));
      log.warn({ err: msg }, 'ambiguous SMTP failure: not retrying (at-most-once)');
      throw new UnrecoverableError(msg);
    }
    // Transient & definitely not sent.
    const isLastAttempt = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    if (isLastAttempt) {
      await reindex(emailId, await markFailed(emailId, 'sending', 'retries_exhausted', msg));
      log.warn({ err: msg }, 'transient SMTP failure: retries exhausted');
      throw new UnrecoverableError(msg);
    }
    await reindex(emailId, await releaseForRetry(emailId, msg));
    log.warn({ err: msg, attempt: job.attemptsMade + 1 }, 'transient SMTP failure: will retry');
    throw err;
  }
}
