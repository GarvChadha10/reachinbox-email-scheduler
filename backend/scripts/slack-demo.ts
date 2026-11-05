/**
 * Live Slack demo: makes a sender hit its hourly limit for YOUR account and shows the notification.
 *   1. Log in with Google in the dashboard, open the profile menu -> Slack -> Connect Slack.
 *   2. Keep `npm run dev:worker` running.
 *   3. npm run slack:demo -w backend -- you@gmail.com
 * Schedules 6 emails with a campaign hourly limit of 2 on ONE sender: 2 send, the 3rd hits the limit,
 * a Slack message is posted (once per sender per hour), and the rest are deferred to the next hour.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/queue/connection.js';
import { closeQueues } from '../src/queue/queues.js';
import { createCampaign } from '../src/modules/campaigns/campaigns.service.js';
import { listActiveSenders } from '../src/modules/senders/senders.service.js';
import { sleep } from './lib.js';

const email = process.argv[2];
if (!email) {
  console.error('usage: npm run slack:demo -w backend -- <your google email>');
  process.exit(1);
}
const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
if (!user) throw new Error(`No user ${email}. Log in with Google first.`);
const conn = await prisma.slackConnection.findUnique({ where: { userId: user.id } });
console.log(conn ? `Slack connected: ${conn.teamName} ${conn.channelName}` : 'WARNING: Slack not connected; the limit hit will be silent (by design).');

// Pick a sender with no rate-limit notification yet this hour, so the demo always posts.
const windowStart = new Date(Math.floor(Date.now() / 3_600_000) * 3_600_000);
const used = await prisma.notificationLog.findMany({ where: { userId: user.id, windowStart }, select: { senderId: true } });
const sender = (await listActiveSenders()).find((s) => !used.some((u) => u.senderId === s.id));
if (!sender) throw new Error('Every sender already notified this hour; try again next hour.');

const since = new Date();
const res = await createCampaign(user.id, `slack-demo-${randomUUID()}`, {
  subject: 'Slack rate-limit demo',
  body: 'This campaign deliberately exceeds its hourly limit.',
  recipients: Array.from({ length: 6 }, (_, i) => `slack-demo-${i}-${Date.now()}@example.com`),
  startAt: new Date().toISOString(),
  delayMs: 0,
  hourlyLimit: 2,
  senderId: sender.id,
});
console.log(`scheduled ${res.payload.scheduledCount} emails from ${sender.email}, hourly limit 2`);

for (let i = 0; i < 45; i++) {
  const log = await prisma.notificationLog.findFirst({ where: { userId: user.id, senderId: sender.id, createdAt: { gte: since } } });
  if (log && log.status !== 'pending') {
    console.log(`notification_log: status=${log.status} response=${log.response}`);
    console.log(log.status === '200' ? 'Slack message delivered. Check your channel.' : 'Slack did not accept the message (see status).');
    break;
  }
  await sleep(2000);
}
const rows = await prisma.email.groupBy({ by: ['status'], where: { campaignId: res.payload.campaign.id }, _count: true });
console.log('campaign status:', rows.map((r) => `${r.status}=${r._count}`).join(' '));
await closeQueues();
await prisma.$disconnect();
redis.disconnect();
