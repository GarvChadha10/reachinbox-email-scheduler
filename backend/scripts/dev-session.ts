/** Prints a session cookie for the local demo user, e.g. for curl. Local development only. */
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/queue/connection.js';
import { demoCookie } from './lib.js';

console.log(await demoCookie());
await prisma.$disconnect();
redis.disconnect();
