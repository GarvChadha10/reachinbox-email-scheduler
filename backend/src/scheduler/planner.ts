export const HOUR_MS = 3_600_000;

export interface PlanInput {
  recipients: readonly string[];
  senderIds: readonly string[];
  startAt: number; // epoch ms
  delayMs: number; // effective (already clamped)
  hourlyLimit: number; // effective, per sender (already clamped)
  now: number; // epoch ms
}

export interface PlannedEmail {
  recipient: string;
  senderId: string;
  scheduledAt: number; // epoch ms
  plannedIndex: number;
}

/**
 * Tier 1 of rate limiting: spread a campaign over time with pure arithmetic so that most jobs are
 * already placed in a window with capacity. The Redis guard (tier 2) remains authoritative at runtime.
 *
 * Senders are assigned round-robin; each sender's subsequence is spaced by `delayMs` and capped at
 * `hourlyLimit` per fixed UTC hour window, overflowing into the next window.
 */
export function planSchedule(input: PlanInput): PlannedEmail[] {
  const { recipients, senderIds, delayMs, hourlyLimit } = input;
  if (senderIds.length === 0) throw new Error('planSchedule: at least one sender is required');
  if (hourlyLimit < 1) throw new Error('planSchedule: hourlyLimit must be >= 1');

  const start = Math.max(input.startAt, input.now);
  const S = senderIds.length;
  const prevT = new Map<string, number>();
  const counts = new Map<string, number>(); // `${sender}|${window}` -> count

  const out: PlannedEmail[] = new Array(recipients.length);
  for (let i = 0; i < recipients.length; i++) {
    const senderId = senderIds[i % S]!;
    const prev = prevT.get(senderId);
    let t = prev === undefined ? start : Math.max(start, prev + delayMs);
    let win = Math.floor(t / HOUR_MS);
    if ((counts.get(`${senderId}|${win}`) ?? 0) >= hourlyLimit) {
      t = (win + 1) * HOUR_MS;
      win += 1;
    }
    const key = `${senderId}|${win}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    prevT.set(senderId, t);
    out[i] = { recipient: recipients[i]!, senderId, scheduledAt: t, plannedIndex: i };
  }
  return out;
}
