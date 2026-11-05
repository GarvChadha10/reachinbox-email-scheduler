import { prisma } from '../../db/prisma.js';
import { redis } from '../../queue/connection.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

const LOCK_KEY = 'sys:lock:sender-bootstrap';
const ETHEREAL_API = 'https://api.nodemailer.com/user';

interface EtherealAccount {
  user: string;
  pass: string;
  smtp: { host: string; port: number; secure: boolean };
}

/**
 * Same endpoint nodemailer.createTestAccount() uses. We call it directly because nodemailer caches
 * the first account per process (ETHEREAL_CACHE), and we need several distinct senders.
 */
async function createEtherealAccount(): Promise<EtherealAccount> {
  const res = await fetch(ETHEREAL_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ requestor: 'nodemailer', version: '7.0.13' }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json()) as Partial<EtherealAccount> & { status?: string; error?: string };
  if (!res.ok || data.status !== 'success' || !data.user || !data.pass || !data.smtp) {
    throw new Error(`Ethereal account creation failed: ${data.error ?? res.status}`);
  }
  return { user: data.user, pass: data.pass, smtp: data.smtp };
}

/**
 * Ensure at least SENDER_COUNT active Ethereal senders exist (requires internet access). Idempotent: only the missing ones are
 * created. A short Redis lock stops the API and worker(s) from creating accounts in parallel at boot.
 */
export async function ensureSenders(): Promise<void> {
  const active = await prisma.sender.count({ where: { isActive: true } });
  const missing = env.SENDER_COUNT - active;
  if (missing <= 0) return;

  const gotLock = await redis.set(LOCK_KEY, String(process.pid), 'PX', 60_000, 'NX');
  if (!gotLock) {
    // Someone else is creating them; wait briefly and re-check.
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      if ((await prisma.sender.count({ where: { isActive: true } })) >= env.SENDER_COUNT) return;
    }
    throw new Error('Timed out waiting for sender bootstrap');
  }
  try {
    const recheck = env.SENDER_COUNT - (await prisma.sender.count({ where: { isActive: true } }));
    for (let i = 0; i < recheck; i++) {
      const acct = await createEtherealAccount();
      await prisma.sender.create({
        data: {
          email: acct.user,
          displayName: `ReachInbox Sender ${active + i + 1}`,
          smtpHost: acct.smtp.host,
          smtpPort: acct.smtp.port,
          smtpUser: acct.user,
          smtpPass: acct.pass,
        },
      });
      logger.info({ sender: acct.user }, 'created Ethereal sender');
    }
  } finally {
    await redis.del(LOCK_KEY);
  }
}

export async function listActiveSenders() {
  return prisma.sender.findMany({ where: { isActive: true }, orderBy: { createdAt: 'asc' } });
}
