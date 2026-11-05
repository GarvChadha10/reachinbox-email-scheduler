/**
 * Rebuild the Elasticsearch index from Postgres (the source of truth): drop, recreate, bulk-load.
 *   npm run es:reindex
 */
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/queue/connection.js';
import { closeQueues } from '../src/queue/queues.js';
import { ensureEmailIndex, es, ES_INDEX } from '../src/modules/search/es.js';
import { reindexAll } from '../src/modules/search/indexing.js';

const t0 = Date.now();
await es.indices.delete({ index: ES_INDEX }, { ignore: [404] });
await ensureEmailIndex();
const n = await reindexAll((done) => process.stdout.write(`\r  indexed ${done}`));
const count = (await es.count({ index: ES_INDEX })).count;
console.log(`\nreindexed ${n} emails from Postgres in ${Date.now() - t0} ms; index now holds ${count} documents`);
await closeQueues();
await prisma.$disconnect();
await es.close();
redis.disconnect();
