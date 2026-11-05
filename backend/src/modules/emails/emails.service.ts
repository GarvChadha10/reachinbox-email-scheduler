import { prisma } from '../../db/prisma.js';
import { toPage, type Pagination } from '../../lib/pagination.js';
import { notFound } from '../../lib/errors.js';

export const preview = (body: string) => body.replace(/\s+/g, ' ').trim().slice(0, 140);
type ScheduledFilter = 'scheduled' | 'sending' | undefined;
type SentFilter = 'sent' | 'failed' | undefined;

export async function listScheduled(userId: string, p: Pagination, status?: ScheduledFilter) {
  const where = { userId, status: status ? { in: [status] } : { in: ['scheduled', 'sending'] } };
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
        campaign: { select: { subject: true, body: true } },
        sender: { select: { email: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);
  const items = rows.map((r) => ({
    id: r.id,
    recipient: r.recipientEmail,
    subject: r.campaign.subject,
    bodyPreview: preview(r.campaign.body),
    scheduledAt: r.scheduledAt.toISOString(),
    status: r.status as 'scheduled' | 'sending',
    senderEmail: r.sender.email,
    deferredCount: r.deferredCount,
  }));
  return toPage(items, total, p);
}

export async function listSent(userId: string, p: Pagination, status?: SentFilter) {
  const where = { userId, status: status ? { in: [status] } : { in: ['sent', 'failed'] } };
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
        campaign: { select: { subject: true, body: true } },
        sender: { select: { email: true } },
      },
    }),
    prisma.email.count({ where }),
  ]);
  const items = rows.map((r) => ({
    id: r.id,
    recipient: r.recipientEmail,
    subject: r.campaign.subject,
    bodyPreview: preview(r.campaign.body),
    sentAt: r.processedAt?.toISOString() ?? null,
    status: r.status as 'sent' | 'failed',
    failureReason: r.failureReason,
    lastError: r.lastError,
    previewUrl: r.previewUrl,
    senderEmail: r.sender.email,
  }));
  return toPage(items, total, p);
}

export async function getEmail(userId: string, id: string) {
  // Scoped by user_id: another user's email is indistinguishable from a missing one.
  const r = await prisma.email.findFirst({
    where: { id, userId },
    include: { campaign: { select: { subject: true, body: true, delayMs: true, hourlyLimit: true } }, sender: { select: { email: true, displayName: true } } },
  });
  if (!r) throw notFound('Email not found');
  return {
    id: r.id,
    recipient: r.recipientEmail,
    subject: r.campaign.subject,
    body: r.campaign.body,
    status: r.status,
    senderEmail: r.sender.email,
    senderName: r.sender.displayName,
    scheduledAt: r.scheduledAt.toISOString(),
    sentAt: r.processedAt?.toISOString() ?? null,
    attemptCount: r.attemptCount,
    deferredCount: r.deferredCount,
    failureReason: r.failureReason,
    lastError: r.lastError,
    previewUrl: r.previewUrl,
    messageId: r.smtpMessageId,
  };
}
