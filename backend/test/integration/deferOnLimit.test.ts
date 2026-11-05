import { DelayedError, type Job } from 'bullmq';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Fake SMTP: count sends instead of talking to Ethereal.
const sendMail = vi.fn(async (m: { messageId: string }) => ({ messageId: m.messageId, response: '250 OK', envelope: {}, accepted: [], rejected: [], pending: [] }));
vi.mock('../../src/mail/transport.js', () => ({ getTransport: () => ({ sendMail }), closeTransports: () => undefined }));

const { prisma } = await import('../../src/db/prisma.js');
const { redis } = await import('../../src/queue/connection.js');
const { closeQueues } = await import('../../src/queue/queues.js');
const { processEmail } = await import('../../src/worker/processEmail.js');
const { HOUR_MS } = await import('../../src/scheduler/planner.js');
const { makeFixture } = await import('./helpers.js');

afterAll(async () => {
  await closeQueues();
  await prisma.$disconnect();
  redis.disconnect();
});

function fakeJob(emailId: string) {
  const moveToDelayed = vi.fn(async (_ts: number, _token?: string) => undefined);
  const job = { id: `email-${emailId}`, data: { emailId }, attemptsMade: 0, opts: { attempts: 3 }, moveToDelayed } as unknown as Job<{ emailId: string }>;
  return { job, moveToDelayed };
}

describe('(e) hitting the hourly limit defers instead of failing', () => {
  it('cap 2 with 5 due jobs: 2 sent, 3 deferred into the next window, 0 failed', async () => {
    const fx = await makeFixture({ emails: 5, hourlyLimit: 2, delayMs: 0 });
    try {
      const outcomes = await Promise.all(
        fx.emails.map(async (e) => {
          const { job, moveToDelayed } = fakeJob(e.id);
          try {
            return { r: await processEmail(job, 'token'), moveToDelayed };
          } catch (err) {
            if (err instanceof DelayedError) return { r: 'deferred', moveToDelayed };
            throw err;
          }
        }),
      );
      expect(outcomes.filter((o) => o.r === 'sent')).toHaveLength(2);
      expect(outcomes.filter((o) => o.r === 'deferred')).toHaveLength(3);
      expect(sendMail).toHaveBeenCalledTimes(2);

      const rows = await prisma.email.findMany({ where: { campaignId: fx.campaign.id } });
      expect(rows.filter((r) => r.status === 'sent')).toHaveLength(2);
      expect(rows.filter((r) => r.status === 'failed')).toHaveLength(0);
      const deferred = rows.filter((r) => r.status === 'scheduled');
      expect(deferred).toHaveLength(3);
      const nextWindow = (Math.floor(Date.now() / HOUR_MS) + 1) * HOUR_MS;
      for (const d of deferred) {
        expect(d.deferredCount).toBe(1);
        expect(d.scheduledAt.getTime()).toBeGreaterThanOrEqual(nextWindow);
        expect(d.scheduledAt.getTime()).toBeLessThan(nextWindow + 1000);
      }
      // Each deferred job was moved to the delayed set at its new time (order kept via planned_index offset).
      const moved = outcomes.filter((o) => o.r === 'deferred').map((o) => o.moveToDelayed.mock.calls[0]?.[0] ?? 0);
      expect(moved.every((t) => t >= nextWindow)).toBe(true);
    } finally {
      await fx.cleanup();
    }
  });
});
