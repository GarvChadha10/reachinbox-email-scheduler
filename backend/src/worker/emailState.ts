import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

/**
 * Every state transition is a single guarded UPDATE (`WHERE status = <expected>`), so concurrent
 * workers can never both move the same row. Returns the new updated_at when the transition happened.
 *
 *   scheduled -> sending -> sent | failed
 *   sending   -> scheduled   (only for definitely-not-sent transient errors)
 *   scheduled -> failed      (retries exhausted after a transient error)
 */
export type EmailStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export const ALLOWED_TRANSITIONS: Readonly<Record<EmailStatus, readonly EmailStatus[]>> = {
  scheduled: ['sending', 'cancelled', 'failed'],
  sending: ['sent', 'failed', 'scheduled'],
  sent: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: EmailStatus, to: EmailStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

interface Updated {
  updated_at: Date;
}

/** Atomic claim: the real duplicate-send guard. Exactly one caller can win. */
export async function claimEmail(emailId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Updated[]>(Prisma.sql`
    UPDATE emails
       SET status = 'sending', sending_started_at = now(), attempt_count = attempt_count + 1, updated_at = now()
     WHERE id = ${emailId}::uuid AND status = 'scheduled'
     RETURNING updated_at`);
  return rows.length === 1;
}

export async function markSent(
  emailId: string,
  r: { messageId: string; response: string; previewUrl: string | null },
): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Updated[]>(Prisma.sql`
    UPDATE emails
       SET status = 'sent', processed_at = now(), smtp_message_id = ${r.messageId},
           smtp_response = ${r.response}, preview_url = ${r.previewUrl}, last_error = NULL, updated_at = now()
     WHERE id = ${emailId}::uuid AND status = 'sending'
     RETURNING updated_at`);
  return rows[0]?.updated_at ?? null;
}

export async function markFailed(
  emailId: string,
  from: 'sending' | 'scheduled',
  reason: string,
  lastError: string | null,
): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Updated[]>(Prisma.sql`
    UPDATE emails
       SET status = 'failed', processed_at = now(), failure_reason = ${reason},
           last_error = ${lastError}, updated_at = now()
     WHERE id = ${emailId}::uuid AND status = ${from}
     RETURNING updated_at`);
  return rows[0]?.updated_at ?? null;
}

/** sending -> scheduled, only after a definitely-not-sent transient failure. */
export async function releaseForRetry(emailId: string, lastError: string): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Updated[]>(Prisma.sql`
    UPDATE emails
       SET status = 'scheduled', sending_started_at = NULL, last_error = ${lastError}, updated_at = now()
     WHERE id = ${emailId}::uuid AND status = 'sending'
     RETURNING updated_at`);
  return rows[0]?.updated_at ?? null;
}

/** Hourly cap hit: push scheduled_at into the next window, keep status 'scheduled'. */
export async function deferEmail(emailId: string, newScheduledAt: Date): Promise<Date | null> {
  const rows = await prisma.$queryRaw<Updated[]>(Prisma.sql`
    UPDATE emails
       SET scheduled_at = ${newScheduledAt}, deferred_count = deferred_count + 1, updated_at = now()
     WHERE id = ${emailId}::uuid AND status = 'scheduled'
     RETURNING updated_at`);
  return rows[0]?.updated_at ?? null;
}
