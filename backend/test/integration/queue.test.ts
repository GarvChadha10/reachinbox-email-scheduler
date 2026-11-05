import { randomUUID } from 'node:crypto';
import { Queue } from 'bullmq';
import { afterAll, describe, expect, it } from 'vitest';
import { createRedis } from '../../src/queue/connection.js';
import { emailJobId, emailJobOptions } from '../../src/queue/queues.js';

const conn = createRedis();
const queue = new Queue('test-duplicates', { connection: conn });

afterAll(async () => {
  await queue.obliterate({ force: true });
  await queue.close();
  conn.disconnect();
});

describe('(b) duplicate enqueue', () => {
  it('adding the same deterministic job ID twice yields one job', async () => {
    const id = randomUUID();
    const opts = { ...emailJobOptions, jobId: emailJobId(id), delay: 3_600_000 };
    const j1 = await queue.add('send', { emailId: id }, opts);
    const j2 = await queue.add('send', { emailId: id }, opts);
    await queue.addBulk([{ name: 'send', data: { emailId: id }, opts }]);
    expect(j1.id).toBe(j2.id);
    const delayed = await queue.getDelayed();
    expect(delayed.filter((j) => j.id === emailJobId(id))).toHaveLength(1);
    expect(await queue.getDelayedCount()).toBe(1);
  });
});
