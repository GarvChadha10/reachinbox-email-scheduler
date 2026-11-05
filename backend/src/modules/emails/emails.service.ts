import { prisma } from '../../db/prisma.js';
import { toPage, type Pagination } from '../../lib/pagination.js';

export async function listScheduled(userId: string, p: Pagination) {
  const where = { userId, status: { in: ['scheduled', 'sending'] } };
  const [rows, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: [{ scheduledAt: 'asc' }, { seq: 'asc' }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      select: {
        id: true,
        recipientEmail: true,
        scheduledAt: true,
        status: true,
        deferredCount: true,
        campaign: { select: { subject: true } },
        sender: { select: { email: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);
  const items = rows.map((r) => ({
    id: r.id,
    recipient: r.recipientEmail,
    subject: r.campaign.subject,
    scheduledAt: r.scheduledAt.toISOString(),
    status: r.status as 'scheduled' | 'sending',
    senderEmail: r.sender.email,
    deferredCount: r.deferredCount,
  }));
  return toPage(items, total, p);
}

export async function listSent(userId: string, p: Pagination) {
  const where = { userId, status: { in: ['sent', 'failed'] } };
  const [rows, total] = await Promise.all([
    prisma.email.findMany({
      where,
      orderBy: [{ processedAt: 'desc' }, { seq: 'desc' }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      select: {
        id: true,
        recipientEmail: true,
        processedAt: true,
        status: true,
        failureReason: true,
        lastError: true,
        previewUrl: true,
        campaign: { select: { subject: true } },
        sender: { select: { email: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);
  const items = rows.map((r) => ({
    id: r.id,
    recipient: r.recipientEmail,
    subject: r.campaign.subject,
    sentAt: r.processedAt?.toISOString() ?? null,
    status: r.status as 'sent' | 'failed',
    failureReason: r.failureReason,
    lastError: r.lastError,
    previewUrl: r.previewUrl,
    senderEmail: r.sender.email,
  }));
  return toPage(items, total, p);
}
