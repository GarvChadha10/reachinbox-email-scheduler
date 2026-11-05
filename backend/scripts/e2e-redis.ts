/**
 * Redis durability test.
 *  Part 1: `docker compose restart redis` with pending delayed jobs -> AOF keeps them; they still send.
 *  Part 2: FLUSHALL (simulated data loss) -> reconcile() rebuilds every job from Postgres; they still send.
 *   npm run e2e:redis -w backend
 */
import { execSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { prisma } from '../src/db/prisma.js';
import { createRedis } from '../src/queue/connection.js';
import { API, api, assert, demoCookie, sleep } from './lib.js';
import { kill, sentCounts, start, waitForHealth } from './proc.js';

const LEAD_S = Number(process.env.LEAD_SECONDS ?? 75);
const run = `redis-${Date.now()}`;
const r = createRedis();
const compose = (cmd: string) => execSync(`docker compose ${cmd}`, { cwd: '..', stdio: 'inherit' });

const apiP = start('api', `${run}-api`);
const workerP = start('worker', `${run}-worker`);
await waitForHealth(`${API}/health`);
await sleep(3000);
const cookie = await demoCookie();

async function schedule(label: string) {
  const startAt = new Date(Date.now() + LEAD_S * 1000);
  const res = await api<{ campaign: { id: string } }>('/api/campaigns', {
    method: 'POST',
    cookie,
    headers: { 'Idempotency-Key': randomUUID() },
    body: JSON.stringify({
      subject: `Redis test ${label}`,
      body: 'Survives Redis restarts.',
      recipients: Array.from({ length: 5 }, (_, i) => `${label}${i}-${Date.now()}@example.com`),
      startAt: startAt.toISOString(),
      delayMs: 2000,
      hourlyLimit: 200,
    }),
  });
  assert(res.status === 201, `${label}: campaign created`);
  return { id: res.body.campaign.id, startAt };
}

async function waitAllSent(campaignId: string, until: number): Promise<string[]> {
  for (;;) {
    const sent = await prisma.email.count({ where: { campaignId, status: 'sent' } });
    process.stdout.write(`\r  sent ${sent}/5   `);
    if (sent === 5 || Date.now() > until) break;
    await sleep(2000);
  }
  console.log();
  const rows = await prisma.email.findMany({ where: { campaignId } });
  assert(rows.every((x) => x.status === 'sent' && x.attemptCount === 1), 'all 5 sent exactly once');
  return rows.map((x) => x.id);
}

// ---- Part 1: restart Redis (AOF) ----
const c1 = await schedule('aof');
const before = await r.zcard('bull:emails:delayed');
console.log(`delayed jobs before restart: ${before}`);
await sleep(1500); // let appendfsync everysec flush
compose('restart redis');
await sleep(3000);
const after = await r.zcard('bull:emails:delayed');
assert(after >= 5, `delayed jobs survived the Redis restart (${after})`);
const ids1 = await waitAllSent(c1.id, c1.startAt.getTime() + 90_000);

// ---- Part 2: FLUSHALL (data loss) ----
const c2 = await schedule('flush');
await r.flushall();
assert((await r.zcard('bull:emails:delayed')) === 0, 'FLUSHALL wiped every job');
// Any health probe re-seeds the maintenance chain; its next tick detects the wipe and reconciles.
await fetch(`${API}/health`);
for (let i = 0; i < 40 && (await r.zcard('bull:emails:delayed')) === 0; i++) await sleep(2000);
const rebuilt = await r.zcard('bull:emails:delayed');
assert(rebuilt >= 5, `reconcile re-enqueued jobs from Postgres (${rebuilt} delayed)`);
const ids2 = await waitAllSent(c2.id, c2.startAt.getTime() + 120_000);

await kill(workerP, 'SIGTERM'); // drain logs before counting
const counts = sentCounts([`${run}-worker`]);
assert([...ids1, ...ids2].every((id) => counts.get(id) === 1), 'worker log shows one SMTP send per email');

await kill(apiP, 'SIGTERM');
await prisma.$disconnect();
r.disconnect();
console.log('REDIS TEST PASSED');
process.exit(0);
