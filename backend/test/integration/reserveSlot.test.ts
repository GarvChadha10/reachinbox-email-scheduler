import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from '../../src/queue/connection.js';
import { reserveSlot } from '../../src/ratelimit/reserveSlot.js';

const conns = Array.from({ length: 8 }, () => createRedis()); // simulate several worker processes

afterAll(() => conns.forEach((c) => c.disconnect()));

describe('(d) Lua guard under concurrency', () => {
  it('200 concurrent reservations with cap 50 -> exactly 50 OK, 150 LIMIT, slots >= delay apart', async () => {
    const senderId = `t-${randomUUID()}`;
    const delay = 100;
    const now = Date.now();
    const results = await Promise.all(
      Array.from({ length: 200 }, (_, i) =>
        reserveSlot(conns[i % conns.length]!, { senderId, campaignId: 'c1', now, delayMs: delay, senderCap: 50, campaignCap: 1000 }),
      ),
    );
    const ok = results.filter((r) => r.kind === 'OK');
    const limited = results.filter((r) => r.kind === 'LIMIT');
    expect(ok).toHaveLength(50);
    expect(limited).toHaveLength(150);
    const slots = ok.map((r) => (r.kind === 'OK' ? r.slotMs : 0)).sort((a, b) => a - b);
    for (let i = 1; i < slots.length; i++) expect(slots[i]! - slots[i - 1]!).toBeGreaterThanOrEqual(delay);
    for (const l of limited) if (l.kind === 'LIMIT') expect(l.scope).toBe('sender');
  });

  it('enforces the campaign cap separately from the sender cap', async () => {
    const senderId = `t-${randomUUID()}`;
    const now = Date.now();
    const r = [];
    for (let i = 0; i < 4; i++) r.push(await reserveSlot(conns[0]!, { senderId, campaignId: 'cA', now, delayMs: 0, senderCap: 100, campaignCap: 3 }));
    expect(r.map((x) => x.kind)).toEqual(['OK', 'OK', 'OK', 'LIMIT']);
    expect(r[3]!.kind === 'LIMIT' && r[3]!.scope).toBe('campaign');
    // Another campaign on the same sender still has room.
    expect((await reserveSlot(conns[0]!, { senderId, campaignId: 'cB', now, delayMs: 0, senderCap: 100, campaignCap: 3 })).kind).toBe('OK');
  });
});
