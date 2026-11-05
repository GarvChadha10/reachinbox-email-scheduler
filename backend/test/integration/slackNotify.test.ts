import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { redis } from '../../src/queue/connection.js';
import { env } from '../../src/config/env.js';
import { encrypt } from '../../src/lib/crypto.js';
import { notifyRateLimitHit } from '../../src/modules/slack/slack.service.js';
import { makeFixture } from './helpers.js';

// A local stand-in for Slack's incoming-webhook endpoint.
const received: { path: string; body: { text: string } }[] = [];
let server: Server;
let base = '';

beforeAll(async () => {
  server = createServer((req, res) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      received.push({ path: req.url ?? '', body: JSON.parse(data) as { text: string } });
      if (req.url === '/gone') {
        res.writeHead(404).end('no_service');
      } else res.writeHead(200).end('ok');
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  server.close();
  await prisma.$disconnect();
  redis.disconnect();
});

describe('(f) Slack notification on rate-limit hit', () => {
  it('posts once per (user, sender, window), skips without a connection, and drops revoked webhooks', async () => {
    const fx = await makeFixture({ emails: 1 });
    const windowEndMs = (Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000;
    const notice = { userId: fx.user.id, senderId: fx.sender.id, senderEmail: fx.sender.email, cap: 50, scope: 'sender' as const, windowEndMs };
    try {
      // No connection yet: nothing posted and no log row, so a later connection can still notify.
      await notifyRateLimitHit(notice);
      expect(received).toHaveLength(0);
      expect(await prisma.notificationLog.count({ where: { userId: fx.user.id } })).toBe(0);

      // Connect (as the OAuth callback would) and hit the limit from 5 workers at once.
      await prisma.slackConnection.create({ data: { userId: fx.user.id, webhookUrlEnc: encrypt(`${base}/hook`, env.ENCRYPTION_KEY), teamName: 'Test', channelName: '#alerts' } });
      await Promise.all(Array.from({ length: 5 }, () => notifyRateLimitHit(notice)));
      expect(received).toHaveLength(1);
      expect(received[0]!.body.text).toContain(fx.sender.email);
      expect(received[0]!.body.text).toContain('50 emails/hour');
      expect(received[0]!.body.text).toContain('IST');
      const log = await prisma.notificationLog.findFirstOrThrow({ where: { userId: fx.user.id } });
      expect(log.status).toBe('200');

      // Revoked webhook (Slack answers 404 no_service): connection is removed, nothing throws.
      await prisma.slackConnection.update({ where: { userId: fx.user.id }, data: { webhookUrlEnc: encrypt(`${base}/gone`, env.ENCRYPTION_KEY) } });
      await notifyRateLimitHit({ ...notice, windowEndMs: windowEndMs + 3_600_000 });
      expect(received.at(-1)!.path).toBe('/gone');
      expect(await prisma.slackConnection.count({ where: { userId: fx.user.id } })).toBe(0);
    } finally {
      await prisma.notificationLog.deleteMany({ where: { userId: fx.user.id } });
      await fx.cleanup();
    }
  });
});
