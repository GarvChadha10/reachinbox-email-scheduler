import { Redis } from 'ioredis';
import { env } from '../config/env.js';

/**
 * BullMQ requires maxRetriesPerRequest=null on connections used by Workers (blocking commands).
 * We use the same options everywhere for simplicity.
 */
export function createRedis(): Redis {
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: true });
}

/** Shared connection for non-blocking use (queues, rate limiter, state nonces). */
export const redis = createRedis();
