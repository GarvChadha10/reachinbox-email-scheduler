import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/db/prisma.js';

/** Creates an isolated user + sender + campaign so tests never collide with each other or real data. */
export async function makeFixture(opts: { emails: number; hourlyLimit?: number; delayMs?: number; scheduledAt?: Date }) {
  const tag = randomUUID().slice(0, 8);
  const user = await prisma.user.create({ data: { googleSub: `test-${tag}`, email: `test-${tag}@example.com`, name: `Test ${tag}` } });
  const sender = await prisma.sender.create({
    data: {
      email: `sender-${tag}@test.invalid`,
      displayName: 'Test sender',
      smtpHost: 'localhost',
      smtpPort: 2525,
      smtpUser: 'x',
      smtpPass: 'x',
      isActive: false, // never picked up by the real planner
    },
  });
  const campaign = await prisma.campaign.create({
    data: {
      userId: user.id,
      idempotencyKey: `k-${tag}`,
      subject: 'Integration',
      body: 'Body',
      startAt: new Date(),
      delayMs: opts.delayMs ?? 0,
      hourlyLimit: opts.hourlyLimit ?? 1000,
      totalCount: opts.emails,
    },
  });
  const emails = [];
  for (let i = 0; i < opts.emails; i++) {
    emails.push(
      await prisma.email.create({
        data: {
          campaignId: campaign.id,
          userId: user.id,
          senderId: sender.id,
          recipientEmail: `r${i}-${tag}@example.com`,
          scheduledAt: opts.scheduledAt ?? new Date(),
          plannedIndex: i,
          queued: true,
        },
      }),
    );
  }
  return {
    user,
    sender,
    campaign,
    emails,
    async cleanup() {
      await prisma.user.delete({ where: { id: user.id } }); // cascades campaigns + emails
      await prisma.sender.delete({ where: { id: sender.id } });
    },
  };
}
