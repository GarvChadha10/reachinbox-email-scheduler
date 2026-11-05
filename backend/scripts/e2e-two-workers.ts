/**
 * Two worker processes consume the same queue concurrently; every email must be sent exactly once,
 * per-sender spacing must hold across processes, and both workers must do work.
 *   npm run e2e:two-workers -w backend
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/queue/connection.js';
import { env } from '../src/config/env.js';
import { API, api, assert, demoCookie, sleep } from './lib.js';
import { kill, sentCounts, start, waitForHealth } from './proc.js';

const N = 30;
const run = `two-${Date.now()}`;
const apiP = start('api', `${run}-api`);
const w1 = start('worker', `${run}-w1`);
const w2 = start('worker', `${run}-w2`);
await waitForHealth(`${API}/health`);
await sleep(4000);

const res = await api<{ campaign: { id: string } }>('/api/campaigns', {
  method: 'POST',
  cookie: await demoCookie(),
  headers: { 'Idempotency-Key': randomUUID() },
  body: JSON.stringify({
    subject: `Two workers ${run}`,
    body: 'Concurrency test.',
    recipients: Array.from({ length: N }, (_, i) => `two${i}-${Date.now()}@example.com`),
    startAt: new Date(Date.now() + 5000).toISOString(),
    delayMs: 0, // clamped up to MIN_DELAY_BETWEEN_EMAILS_MS
    hourlyLimit: 1000,
  }),
});
assert(res.status === 201, 'campaign created');
const campaignId = res.body.campaign.id;

const deadline = Date.now() + 120_000;
for (;;) {
  const sent = await prisma.email.count({ where: { campaignId, status: 'sent' } });
  process.stdout.write(`\r  sent ${sent}/${N}   `);
  if (sent === N || Date.now() > deadline) break;
  await sleep(2000);
}
console.log();

const rows = await prisma.email.findMany({ where: { campaignId }, include: { sender: true } });
assert(rows.every((r) => r.status === 'sent' && r.attemptCount === 1), `all ${N} sent, each claimed once`);
await Promise.all([kill(w1, 'SIGTERM'), kill(w2, 'SIGTERM')]); // drain logs before counting
const c1 = sentCounts([`${run}-w1`]);
const c2 = sentCounts([`${run}-w2`]);
const bad = rows.filter((r) => (c1.get(r.id) ?? 0) + (c2.get(r.id) ?? 0) !== 1);
if (bad.length) console.log('  mismatches:', bad.map((r) => [r.id, c1.get(r.id) ?? 0, c2.get(r.id) ?? 0]));
assert(bad.length === 0, 'exactly one SMTP send per email across both workers');
console.log(`  worker1 sent ${c1.size}, worker2 sent ${c2.size}`);
assert(c1.size > 0 && c2.size > 0, 'both workers processed jobs');

// Per-sender spacing must hold across both processes (Lua slot reservation).
const bySender = new Map<string, number[]>();
for (const r of rows) bySender.set(r.sender.email, [...(bySender.get(r.sender.email) ?? []), r.sendingStartedAt!.getTime()]);
let minGap = Infinity;
for (const ts of bySender.values()) {
  ts.sort((a, b) => a - b);
  for (let i = 1; i < ts.length; i++) minGap = Math.min(minGap, ts[i]! - ts[i - 1]!);
}
console.log(`  min gap between send starts of the same sender: ${minGap} ms (configured ${env.MIN_DELAY_BETWEEN_EMAILS_MS} ms)`);
// sending_started_at is stamped at the claim, immediately after waiting for the reserved slot.
// (processed_at would include variable SMTP latency.) Allow 100 ms for timer/DB clock jitter.
assert(minGap >= env.MIN_DELAY_BETWEEN_EMAILS_MS - 100, 'per-sender spacing respected across workers');

await kill(apiP, 'SIGTERM');
await prisma.$disconnect();
redis.disconnect();
console.log('TWO-WORKER TEST PASSED');
