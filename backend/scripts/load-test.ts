/**
 * Load test (D12). Proves, under a burst of 1000+ emails due at once:
 *   - scheduling is fast (one transaction + chunked bulk enqueue),
 *   - no sender ever exceeds MAX_EMAILS_PER_HOUR_PER_SENDER in any UTC hour window,
 *   - overflow is deferred (never dropped or failed), including overflow the planner could not
 *     foresee (a second campaign on the same senders, caught by the Redis Lua guard),
 *   - every email ends up `sent` or `scheduled`; none lost, none duplicated.
 *
 * Isolation: uses its own user and 3 dedicated (inactive, never pooled) senders, and a worker with
 * MAIL_DRY_RUN=true so nothing is sent over SMTP. Requires that no other worker is running.
 *   npm run load-test -w backend          (KEEP=1 keeps the data afterwards)
 */
import { randomUUID } from 'node:crypto';

const CAP = 50;
const MIN_DELAY = Number(process.env.LOAD_MIN_DELAY_MS ?? 200);
// Must be set before any app module loads, so the in-process planner and the worker share the limits.
process.env.MAX_EMAILS_PER_HOUR_PER_SENDER = String(CAP);
process.env.MIN_DELAY_BETWEEN_EMAILS_MS = String(MIN_DELAY);

const { prisma } = await import('../src/db/prisma.js');
const { redis } = await import('../src/queue/connection.js');
const { closeQueues, emailJobId, emailsQueue } = await import('../src/queue/queues.js');
const { createCampaign } = await import('../src/modules/campaigns/campaigns.service.js');
const { HOUR_MS } = await import('../src/scheduler/planner.js');
const lib = await import('./lib.js');
const assert: (cond: unknown, msg: string) => asserts cond = lib.assert;
const { sleep } = lib;
const { kill, start } = await import('./proc.js');
const N = 1000;
const EXTRA = 120; // second campaign on the same senders, unknown to the first plan

if ((await emailsQueue.getWorkers()).length > 0) {
  console.error('Stop other workers first (npm run dev:worker): the load test runs its own dry-run worker.');
  process.exit(1);
}

const tag = randomUUID().slice(0, 8);
const user = await prisma.user.create({ data: { googleSub: `load-${tag}`, email: `load-${tag}@example.com`, name: 'Load Test' } });
const senders = await Promise.all(
  [1, 2, 3].map((i) =>
    prisma.sender.create({
      data: { email: `load${i}-${tag}@test.invalid`, displayName: `Load ${i}`, smtpHost: 'localhost', smtpPort: 2525, smtpUser: 'x', smtpPass: 'x', isActive: false },
    }),
  ),
);
const env = { MAX_EMAILS_PER_HOUR_PER_SENDER: String(CAP), MIN_DELAY_BETWEEN_EMAILS_MS: String(MIN_DELAY), MAIL_DRY_RUN: 'true', WORKER_CONCURRENCY: '5' };
const worker = start('worker', `load-${tag}`, env);
await sleep(4000);

const rcpts = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}@load.example`);
// UI-style values: delay 0 and hourly 1000 are clamped to the server limits (MIN_DELAY / CAP).
const base = { subject: 'Load test', body: 'Burst', startAt: new Date().toISOString(), delayMs: 0, hourlyLimit: 1000 };

let t0 = performance.now();
const a = await createCampaign(user.id, `a-${tag}`, { ...base, recipients: rcpts('a', N) }, { senderPool: senders });
console.log(`scheduled ${a.payload.scheduledCount} emails in ${(performance.now() - t0).toFixed(0)} ms (planner + 1 tx + bulk enqueue); effective`, a.payload.effective);
t0 = performance.now();
const b = await createCampaign(user.id, `b-${tag}`, { ...base, recipients: rcpts('b', EXTRA) }, { senderPool: senders });
console.log(`second campaign: ${b.payload.scheduledCount} emails in ${(performance.now() - t0).toFixed(0)} ms`);
const ids = [a.payload.campaign.id, b.payload.campaign.id];
const total = N + EXTRA;

// Drain: wait until nothing is due in the current window any more.
const deadline = Date.now() + 10 * 60_000;
for (;;) {
  const [due, sending, sent] = await Promise.all([
    prisma.email.count({ where: { campaignId: { in: ids }, status: 'scheduled', scheduledAt: { lte: new Date() } } }),
    prisma.email.count({ where: { campaignId: { in: ids }, status: 'sending' } }),
    prisma.email.count({ where: { campaignId: { in: ids }, status: 'sent' } }),
  ]);
  process.stdout.write(`\r  sent ${sent}  due-now ${due}  sending ${sending}   `);
  if ((due === 0 && sending === 0) || Date.now() > deadline) break;
  await sleep(2000);
}
console.log();

const rows = await prisma.email.findMany({ where: { campaignId: { in: ids } }, select: { id: true, status: true, senderId: true, sendingStartedAt: true, scheduledAt: true, deferredCount: true, attemptCount: true, campaignId: true } });
const byStatus = rows.reduce<Record<string, number>>((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {});
console.log('status counts:', byStatus);

// Per-sender per-UTC-hour-window send counts (by actual send start).
const table = new Map<string, Map<number, number>>();
for (const r of rows) {
  if (r.status !== 'sent' || !r.sendingStartedAt) continue;
  const w = Math.floor(r.sendingStartedAt.getTime() / HOUR_MS);
  const m = table.get(r.senderId) ?? new Map<number, number>();
  m.set(w, (m.get(w) ?? 0) + 1);
  table.set(r.senderId, m);
}
console.log('\nsends per sender per UTC hour window:');
let maxInWindow = 0;
for (const s of senders) {
  for (const [w, n] of table.get(s.id) ?? []) {
    console.log(`  ${s.email.padEnd(34)} ${new Date(w * HOUR_MS).toISOString().slice(0, 13)}:00Z  ${n}`);
    maxInWindow = Math.max(maxInWindow, n);
  }
}
// Planned (future) distribution, to show the spread.
const future = new Map<string, number>();
for (const r of rows.filter((x) => x.status === 'scheduled')) {
  const k = new Date(Math.floor(r.scheduledAt.getTime() / HOUR_MS) * HOUR_MS).toISOString().slice(0, 13);
  future.set(k, (future.get(k) ?? 0) + 1);
}
console.log('\nremaining scheduled emails by future hour (all 3 senders):');
for (const [k, n] of [...future].sort()) console.log(`  ${k}:00Z  ${n}`);

const deferredB = rows.filter((r) => r.campaignId === b.payload.campaign.id && r.deferredCount > 0).length;
console.log(`\nemails deferred at runtime by the Redis guard: ${rows.filter((r) => r.deferredCount > 0).length} (campaign B: ${deferredB})`);

assert(rows.length === total, `no email lost (${rows.length}/${total} rows)`);
assert((byStatus.sent ?? 0) + (byStatus.scheduled ?? 0) === total, 'every email is sent or scheduled');
assert(!byStatus.failed, 'no email failed');
assert(maxInWindow <= CAP, `no sender exceeded ${CAP}/hour in any window (max ${maxInWindow})`);
assert(rows.every((r) => r.attemptCount <= 1), 'no email claimed twice');
assert(deferredB > 0, 'overflow the planner could not foresee was deferred by the runtime guard, not dropped');
assert(maxInWindow === CAP, `the cap was actually reached (a sender sent exactly ${CAP} in a window)`);

await kill(worker, 'SIGTERM');
if (!process.env.KEEP) {
  for (const r of rows) await (await emailsQueue.getJob(emailJobId(r.id)))?.remove().catch(() => undefined);
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.notificationLog.deleteMany({ where: { senderId: { in: senders.map((s) => s.id) } } });
  await prisma.sender.deleteMany({ where: { id: { in: senders.map((s) => s.id) } } });
  console.log('cleaned up load-test data (KEEP=1 to keep it)');
}
await closeQueues();
await prisma.$disconnect();
redis.disconnect();
console.log('LOAD TEST PASSED');
