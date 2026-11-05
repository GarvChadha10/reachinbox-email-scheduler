/**
 * Live Slack demo: makes a sender hit its hourly limit for YOUR account and shows the notification.
 *
 * A single campaign never trips the limit at runtime: the planner already spreads it across hours.
 * The runtime guard (and so the Slack alert) fires when work the planner could not foresee lands
 * on the same sender, e.g. two campaigns sharing one sender. This script reproduces exactly that,
 * with a small per-sender cap (DEMO_CAP, default 3) so only a handful of real Ethereal sends happen.
 *
 *   1. Log in with Google, profile menu -> Slack -> Connect Slack.
 *   2. Stop `npm run dev:worker` (this script runs its own worker with the demo cap).
 *   3. npm run slack:demo -w backend -- you@gmail.com
 */
import { randomUUID } from 'node:crypto';

const DEMO_CAP = Number(process.env.DEMO_CAP ?? 3);
// Set before any app module loads so the planner here and the spawned worker share the cap.
process.env.MAX_EMAILS_PER_HOUR_PER_SENDER = String(DEMO_CAP);

const { prisma } = await import('../src/db/prisma.js');
const { redis } = await import('../src/queue/connection.js');
const { closeQueues, emailsQueue } = await import('../src/queue/queues.js');
const { createCampaign } = await import('../src/modules/campaigns/campaigns.service.js');
const { listActiveSenders } = await import('../src/modules/senders/senders.service.js');
const { sleep } = await import('./lib.js');
const { kill, start } = await import('./proc.js');

const email = process.argv[2];
if (!email) {
  console.error('usage: npm run slack:demo -w backend -- <your google email>');
  process.exit(1);
}
if ((await emailsQueue.getWorkers()).length > 0) {
  console.error('Stop `npm run dev:worker` first: this demo runs its own worker with a per-sender cap of ' + DEMO_CAP + '.');
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

const worker = start('worker', `slack-demo-${Date.now()}`, { MAX_EMAILS_PER_HOUR_PER_SENDER: String(DEMO_CAP) });
await sleep(4000);

const since = new Date();
const campaign = (label: string) =>
  createCampaign(user.id, `slack-demo-${randomUUID()}`, {
    subject: `Slack rate-limit demo (${label})`,
    body: 'Two campaigns share one sender, so together they exceed its hourly limit.',
    recipients: Array.from({ length: DEMO_CAP }, (_, i) => `slack-demo-${label}-${i}-${Date.now()}@example.com`),
    startAt: new Date().toISOString(),
    delayMs: 0,
    hourlyLimit: DEMO_CAP,
    senderId: sender.id,
  });
const a = await campaign('A');
const b = await campaign('B');
console.log(`scheduled 2 campaigns x ${DEMO_CAP} emails, all from ${sender.email} (cap ${DEMO_CAP}/hour for this demo)`);

let delivered = false;
for (let i = 0; i < 45; i++) {
  const log = await prisma.notificationLog.findFirst({ where: { userId: user.id, senderId: sender.id, createdAt: { gte: since } } });
  if (log && log.status !== 'pending') {
    console.log(`notification_log: status=${log.status} response=${log.response}`);
    delivered = log.status === '200';
    console.log(delivered ? 'Slack message delivered. Check your channel.' : 'Slack did not accept the message (see status).');
    break;
  }
  await sleep(2000);
}
if (!conn) console.log('(no Slack connection, so no message was sent; connect Slack and run again)');
else if (!delivered) console.log('No notification recorded yet; check the worker log in backend/.e2e-logs/.');

const rows = await prisma.email.findMany({ where: { campaignId: { in: [a.payload.campaign.id, b.payload.campaign.id] } } });
const deferred = rows.filter((r) => r.status === 'scheduled');
console.log(`emails: sent=${rows.filter((r) => r.status === 'sent').length} deferred=${deferred.length} failed=${rows.filter((r) => r.status === 'failed').length}`);
if (deferred[0]) console.log(`deferred emails resume at ${deferred[0].scheduledAt.toISOString()} (next hour window), sent by your regular worker`);

await kill(worker, 'SIGTERM');
await closeQueues();
await prisma.$disconnect();
redis.disconnect();
