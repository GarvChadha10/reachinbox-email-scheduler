import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { redis } from '../../src/queue/connection.js';
import { closeQueues } from '../../src/queue/queues.js';
import { createApp } from '../../src/api/app.js';

const app = createApp();
const tag = randomUUID().slice(0, 8);
const email = `Pw-${tag}@Example.com`;
const googleOnly = `google-${tag}@example.com`;

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: [email.toLowerCase(), googleOnly] } } });
  await closeQueues();
  await prisma.$disconnect();
  redis.disconnect();
});

const cookieOf = (res: request.Response) => ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('session='));

describe('email + password accounts', () => {
  it('registers, logs in, and rejects bad credentials without revealing which part was wrong', async () => {
    const reg = await request(app).post('/api/auth/register').send({ name: 'Pat Tester', email, password: 'longenough1' });
    expect(reg.status).toBe(201);
    expect(reg.body.email).toBe(email.toLowerCase());
    const cookie = cookieOf(reg);
    expect(cookie).toMatch(/HttpOnly/i);

    // The session from sign-up works on protected routes.
    const me = await request(app).get('/api/auth/me').set('cookie', cookie!.split(';')[0]!);
    expect(me.status).toBe(200);
    expect(me.body.name).toBe('Pat Tester');

    // Stored as a scrypt hash, never the plain password.
    const row = await prisma.user.findUniqueOrThrow({ where: { email: email.toLowerCase() } });
    expect(row.passwordHash).toMatch(/^scrypt\$/);
    expect(row.passwordHash).not.toContain('longenough1');

    expect((await request(app).post('/api/auth/register').send({ name: 'Again', email, password: 'longenough1' })).status).toBe(409);

    const ok = await request(app).post('/api/auth/login').send({ email: email.toUpperCase(), password: 'longenough1' });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toBeTruthy();

    const wrong = await request(app).post('/api/auth/login').send({ email, password: 'wrong-password' });
    const unknown = await request(app).post('/api/auth/login').send({ email: `nobody-${tag}@example.com`, password: 'whatever1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates input and protects Google-only accounts', async () => {
    expect((await request(app).post('/api/auth/register').send({ name: 'X', email: `short-${tag}@example.com`, password: 'short' })).status).toBe(400);
    expect((await request(app).post('/api/auth/register').send({ name: 'X', email: 'not-an-email', password: 'longenough1' })).status).toBe(400);

    await prisma.user.create({ data: { googleSub: `g-${tag}`, email: googleOnly, name: 'Google Only' } });
    const clash = await request(app).post('/api/auth/register').send({ name: 'Hijack', email: googleOnly, password: 'longenough1' });
    expect(clash.status).toBe(409);
    expect(clash.body.error.message).toContain('Google');
    // A Google-only account has no password, so password login can't get in.
    expect((await request(app).post('/api/auth/login').send({ email: googleOnly, password: 'longenough1' })).status).toBe(401);
  });
});
