import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '../../src/db/prisma.js';
import { redis } from '../../src/queue/connection.js';
import { claimEmail } from '../../src/worker/emailState.js';
import { makeFixture } from './helpers.js';

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe('(a) atomic claim', () => {
  it('exactly one of 20 concurrent claimers wins', async () => {
    const fx = await makeFixture({ emails: 1 });
    try {
      const id = fx.emails[0]!.id;
      const results = await Promise.all(Array.from({ length: 20 }, () => claimEmail(id)));
      expect(results.filter(Boolean)).toHaveLength(1);
      const row = await prisma.email.findUniqueOrThrow({ where: { id } });
      expect(row.status).toBe('sending');
      expect(row.attemptCount).toBe(1);
      // A later claim (e.g. a stalled job re-delivered) also loses.
      expect(await claimEmail(id)).toBe(false);
    } finally {
      await fx.cleanup();
    }
  });
});
