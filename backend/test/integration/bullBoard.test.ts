import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { redis } from '../../src/queue/connection.js';
import { closeQueues, emailsQueue } from '../../src/queue/queues.js';
import { createApp } from '../../src/api/app.js';

const app = createApp();
const email = `board-${randomUUID().slice(0, 8)}@example.com`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await closeQueues();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('Bull Board access', () => {
  it('sends signed-out browsers to the login page and rejects signed-out API calls', async () => {
    const page = await request(app).get('/admin/queues').set('accept', 'text/html');
    expect(page.status).toBe(302);
    expect(page.headers.location).toMatch(/\/login$/);
    const api = await request(app).get('/admin/queues/api/queues').set('accept', 'application/json');
    expect(api.status).toBe(401);
  });

  it('opens for any signed-in user, read-only', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Board Viewer', email, password: 'longenough1' });
    const cookie = ([] as string[]).concat(reg.headers['set-cookie'] ?? []).find((c) => c.startsWith('session='))!.split(';')[0]!;

    const page = await request(app).get('/admin/queues').set('cookie', cookie).set('accept', 'text/html');
    expect(page.status).toBe(200);
    const queues = await request(app).get('/admin/queues/api/queues').set('cookie', cookie);
    expect(queues.status).toBe(200);
    const listed = (queues.body.queues as { name: string; readOnlyMode: boolean }[]).map((q) => [q.name, q.readOnlyMode]);
    expect(listed).toEqual(expect.arrayContaining([['emails', true], ['indexing', true], ['maintenance', true]]));

    // Actions are refused, and the queue is untouched.
    const pause = await request(app).put('/admin/queues/api/queues/emails/pause').set('cookie', cookie);
    expect(pause.status).toBeGreaterThanOrEqual(400);
    expect(await emailsQueue.isPaused()).toBe(false);
  });
});
