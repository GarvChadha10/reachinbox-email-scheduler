import { readFileSync } from 'node:fs';
import type { Redis } from 'ioredis';
import { HOUR_MS } from '../scheduler/planner.js';

const LUA = readFileSync(new URL('./reserve_slot.lua', import.meta.url), 'utf8');

export type ReserveResult =
  | { kind: 'OK'; slotMs: number }
  | { kind: 'LIMIT'; windowEndMs: number; scope: 'sender' | 'campaign' };

export interface ReserveArgs {
  senderId: string;
  campaignId: string;
  now: number;
  delayMs: number;
  senderCap: number;
  campaignCap: number;
}

type WithReserve = Redis & {
  reserveSlot(key: string, ...args: (string | number)[]): Promise<[number, number, string?]>;
};

/** Registers the script with defineCommand (EVALSHA with automatic EVAL fallback). */
function withCommand(redis: Redis): WithReserve {
  const r = redis as WithReserve;
  if (typeof r.reserveSlot !== 'function') redis.defineCommand('reserveSlot', { numberOfKeys: 1, lua: LUA });
  return r;
}

export async function reserveSlot(redis: Redis, a: ReserveArgs): Promise<ReserveResult> {
  const res = await withCommand(redis).reserveSlot(
    `rl:next:${a.senderId}`,
    a.now,
    a.delayMs,
    a.senderCap,
    a.campaignCap,
    HOUR_MS,
    a.senderId,
    a.campaignId,
  );
  if (res[0] === 0) return { kind: 'OK', slotMs: Number(res[1]) };
  return { kind: 'LIMIT', windowEndMs: Number(res[1]), scope: res[2] === 'campaign' ? 'campaign' : 'sender' };
}
