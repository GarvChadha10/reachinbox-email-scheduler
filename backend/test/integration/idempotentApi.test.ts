import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { redis } from '../../src/queue/connection.js';
import { closeQueues, emailJobId, emailsQueue } from '../../src/queue/queues.js';
import { createApp } from '../../src/api/app.js';
import { signSession } from '../../src/modules/auth/session.js';
import { ensureSenders } from '../../src/modules/senders/senders.service.js';

const app = createApp();
let userId = '';

afterAll(async () => {
  const emails = await prisma.email.findMany({ where: { userId }, select: { id: true } });
  for (const e of emails) await (await emailsQueue.getJob(emailJobId(e.id)))?.remove();
  if (userId) await prisma.user.delete({ where: { id: userId } });
  await closeQueues();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('(c) idempotent API', () => {
  it('same Idempotency-Key twice creates exactly one campaign', async () => {
    await ensureSenders();
    const tag = randomUUID().slice(0, 8);
    const user = await prisma.user.create({ data: { googleSub: `api-${tag}`, email: `api-${tag}@example.com`, name: 'API test' } });
    userId = user.id;
    const cookie = `session=${signSession(user)}`;
    const key = randomUUID();
    const body = {
      subject: 'Idempotency',
      body: 'Hello',
      recipients: ['x@example.com', 'y@example.com', 'X@example.com'],
      startAt: new Date(Date.now() + 365 * 86_400_000).toISOString(), // far future: never actually sent
      delayMs: 2000,
      hourlyLimit: 10,
    };

    const first = await request(app).post('/api/campaigns').set('cookie', cookie).set('Idempotency-Key', key).send(body);
    const second = await request(app).post('/api/campaigns').set('cookie', cookie).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.campaign.id).toBe(first.body.campaign.id);
    expect(first.body.scheduledCount).toBe(2);
    expect(first.body.duplicatesRemoved).toBe(1);

    // Concurrent duplicates race on the unique constraint and still produce one campaign.
    const key2 = randomUUID();
    const burst = await Promise.all(
      Array.from({ length: 5 }, () => request(app).post('/api/campaigns').set('cookie', cookie).set('Idempotency-Key', key2).send(body)),
    );
    expect(new Set(burst.map((r) => r.body.campaign.id)).size).toBe(1);
    expect(burst.filter((r) => r.status === 201)).toHaveLength(1);

    expect(await prisma.campaign.count({ where: { userId } })).toBe(2);
    expect(await prisma.email.count({ where: { userId } })).toBe(4);

    // Missing header and unauthenticated requests are rejected.
    expect((await request(app).post('/api/campaigns').set('cookie', cookie).send(body)).status).toBe(400);
    expect((await request(app).post('/api/campaigns').set('Idempotency-Key', key).send(body)).status).toBe(401);
  });
});
