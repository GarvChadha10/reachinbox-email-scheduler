/**
 * Prints the Ethereal sender accounts so you can log in at https://ethereal.email/login and see
 * every message the scheduler sent from that sender. These are throwaway Ethereal test accounts
 * (nothing is ever delivered to a real inbox). Local development only.
 *   npm run ethereal -w backend
 */
import { prisma } from '../src/db/prisma.js';
import { redis } from '../src/queue/connection.js';

const senders = await prisma.sender.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
const sent = await prisma.email.groupBy({ by: ['senderId'], where: { status: 'sent' }, _count: true });
console.log('Log in at https://ethereal.email/login with any of these, then open "Messages":\n');
for (const s of senders) {
  const n = sent.find((x) => x.senderId === s.id)?._count ?? 0;
  console.log(`${s.displayName}  (${n} sent)`);
  console.log(`  username: ${s.smtpUser}`);
  console.log(`  password: ${s.smtpPass}\n`);
}
await prisma.$disconnect();
redis.disconnect();
