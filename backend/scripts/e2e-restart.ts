/**
 * Restart test: schedule 10 emails ~2 minutes out, SIGKILL the API and the worker together,
 * restart both, and verify every email is sent exactly once and not before its scheduled time.
 *   npm run e2e:restart -w backend          (LEAD_SECONDS=60 to make it faster)
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/queue/connection.js';
import { API, api, assert, demoCookie, sleep } from './lib.js';
import { kill, sentCounts, start, waitForHealth } from './proc.js';

const LEAD_S = Number(process.env.LEAD_SECONDS ?? 120);
const run = `restart-${Date.now()}`;

let apiP = start('api', `${run}-api-1`);
let workerP = start('worker', `${run}-worker-1`);
await waitForHealth(`${API}/health`);
await sleep(3000);

const cookie = await demoCookie();
const startAt = new Date(Date.now() + LEAD_S * 1000);
const recipients = Array.from({ length: 10 }, (_, i) => `restart${i}-${Date.now()}@example.com`);
const res = await api<{ campaign: { id: string } }>('/api/campaigns', {
  method: 'POST',
  cookie,
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({ subject: `Restart test ${run}`, body: 'Sent after a hard restart.', recipients, startAt: startAt.toISOString(), delayMs: 2000, hourlyLimit: 200 }),
});
assert(res.status === 201, `campaign created (HTTP ${res.status})`);
const campaignId = res.body.campaign.id;

await sleep(2000);
console.log('SIGKILL api + worker');
await Promise.all([kill(apiP), kill(workerP)]);
const pending = await prisma.email.count({ where: { campaignId, status: 'scheduled' } });
assert(pending === 10, `all 10 still scheduled while processes are dead (${pending})`);
await sleep(5000);

console.log('restarting api + worker');
apiP = start('api', `${run}-api-2`);
workerP = start('worker', `${run}-worker-2`);
await waitForHealth(`${API}/health`);

const deadline = startAt.getTime() + 90_000;
for (;;) {
  const sent = await prisma.email.count({ where: { campaignId, status: 'sent' } });
  process.stdout.write(`\r  sent ${sent}/10  (scheduled for ${startAt.toISOString()})   `);
  if (sent === 10 || Date.now() > deadline) break;
  await sleep(2000);
}
console.log();

const rows = await prisma.email.findMany({ where: { campaignId } });
assert(rows.every((r) => r.status === 'sent'), 'all 10 emails sent');
assert(rows.every((r) => r.attemptCount === 1), 'each email claimed exactly once (attempt_count = 1)');
assert(rows.every((r) => r.processedAt!.getTime() >= r.scheduledAt.getTime()), 'no email sent before its scheduled time');
assert(new Set(rows.map((r) => r.smtpMessageId)).size === 10, '10 distinct Message-IDs');
await kill(workerP, 'SIGTERM'); // drain logs before counting
const counts = sentCounts([`${run}-worker-1`, `${run}-worker-2`]);
assert(rows.every((r) => counts.get(r.id) === 1), 'worker logs show exactly one SMTP send per email');
const lateness = rows.map((r) => r.processedAt!.getTime() - r.scheduledAt.getTime());
console.log(`  send lateness vs schedule: min ${Math.min(...lateness)} ms, max ${Math.max(...lateness)} ms`);

await kill(apiP, 'SIGTERM');
await prisma.$disconnect();
redis.disconnect();
console.log('RESTART TEST PASSED');
