import { describe, expect, it } from 'vitest';
import { HOUR_MS, planSchedule, type PlannedEmail } from '../../src/scheduler/planner.js';

const recipients = (n: number) => Array.from({ length: n }, (_, i) => `r${i}@example.com`);
const NOW = Date.UTC(2026, 0, 1, 10, 0, 0);

function perSender(plan: PlannedEmail[]) {
  const m = new Map<string, PlannedEmail[]>();
  for (const p of plan) m.set(p.senderId, [...(m.get(p.senderId) ?? []), p]);
  return m;
}

describe('planSchedule', () => {
  it('preserves recipient order and planned_index', () => {
    const plan = planSchedule({ recipients: recipients(10), senderIds: ['a', 'b'], startAt: NOW, delayMs: 2000, hourlyLimit: 100, now: NOW });
    expect(plan.map((p) => p.recipient)).toEqual(recipients(10));
    expect(plan.map((p) => p.plannedIndex)).toEqual([...Array(10).keys()]);
    // Round-robin sender assignment.
    expect(plan.map((p) => p.senderId)).toEqual(['a', 'b', 'a', 'b', 'a', 'b', 'a', 'b', 'a', 'b']);
  });

  it('never exceeds hourlyLimit per sender per window', () => {
    const plan = planSchedule({ recipients: recipients(500), senderIds: ['a', 'b'], startAt: NOW, delayMs: 1000, hourlyLimit: 40, now: NOW });
    const counts = new Map<string, number>();
    for (const p of plan) {
      const k = `${p.senderId}|${Math.floor(p.scheduledAt / HOUR_MS)}`;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    expect(Math.max(...counts.values())).toBeLessThanOrEqual(40);
  });

  it('spaces each sender by at least delayMs', () => {
    const plan = planSchedule({ recipients: recipients(300), senderIds: ['a', 'b', 'c'], startAt: NOW, delayMs: 7000, hourlyLimit: 30, now: NOW });
    for (const list of perSender(plan).values()) {
      for (let i = 1; i < list.length; i++) expect(list[i]!.scheduledAt - list[i - 1]!.scheduledAt).toBeGreaterThanOrEqual(7000);
    }
  });

  it('spreads 1000 recipients, limit 50, 3 senders across hours', () => {
    const plan = planSchedule({ recipients: recipients(1000), senderIds: ['a', 'b', 'c'], startAt: NOW, delayMs: 2000, hourlyLimit: 50, now: NOW });
    expect(plan).toHaveLength(1000);
    const bySender = perSender(plan);
    expect(bySender.get('a')).toHaveLength(334);
    expect(bySender.get('b')).toHaveLength(333);
    expect(bySender.get('c')).toHaveLength(333);
    const windows = new Map<number, number>();
    for (const p of bySender.get('a')!) {
      const w = Math.floor(p.scheduledAt / HOUR_MS);
      windows.set(w, (windows.get(w) ?? 0) + 1);
    }
    // 334 emails at 50/hour -> 7 windows: six full (50) and one with 34.
    expect([...windows.values()]).toEqual([50, 50, 50, 50, 50, 50, 34]);
    // Overflowed emails start exactly at the next window boundary.
    const second = bySender.get('a')![50]!;
    expect(second.scheduledAt).toBe((Math.floor(NOW / HOUR_MS) + 1) * HOUR_MS);
    // Times are monotonic per sender.
    for (const list of bySender.values()) for (let i = 1; i < list.length; i++) expect(list[i]!.scheduledAt).toBeGreaterThan(list[i - 1]!.scheduledAt);
  });

  it('clamps a start time in the past to now', () => {
    const plan = planSchedule({ recipients: recipients(3), senderIds: ['a'], startAt: NOW - 86_400_000, delayMs: 2000, hourlyLimit: 10, now: NOW });
    expect(plan[0]!.scheduledAt).toBe(NOW);
    expect(plan[1]!.scheduledAt).toBe(NOW + 2000);
  });

  it('honours a future start time', () => {
    const start = NOW + 3 * HOUR_MS + 123;
    const plan = planSchedule({ recipients: recipients(2), senderIds: ['a', 'b'], startAt: start, delayMs: 2000, hourlyLimit: 10, now: NOW });
    expect(plan.map((p) => p.scheduledAt)).toEqual([start, start]);
  });

  it('rejects an empty sender pool', () => {
    expect(() => planSchedule({ recipients: recipients(1), senderIds: [], startAt: NOW, delayMs: 0, hourlyLimit: 1, now: NOW })).toThrow();
  });
});
