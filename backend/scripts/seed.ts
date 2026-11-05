/**
 * Seeds the Ethereal sender pool and a local demo user (used only by the verification scripts;
 * real users are created by Google login).
 */
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/queue/connection.js';
import { ensureSenders } from '../src/modules/senders/senders.service.js';
import { ensureDemoUser } from './lib.js';

await ensureSenders();
const u = await ensureDemoUser();
console.log(`senders: ${await prisma.sender.count()}  demo user: ${u.email}`);
await prisma.$disconnect();
redis.disconnect();
