import { prisma } from '../../db/prisma.js';
import { indexingQueue, indexJobId, indexJobOptions } from '../../queue/queues.js';
import { es, ES_INDEX } from './es.js';

const CHUNK = 500;

/** Enqueue index jobs. The indexer always reloads the latest row, so ordering does not matter. */
export async function enqueueIndex(rows: ReadonlyArray<{ id: string; updatedAt: Date }>): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK) {
    await indexingQueue.addBulk(
      rows.slice(i, i + CHUNK).map((r) => ({
        name: 'index',
        data: { emailId: r.id },
        opts: { ...indexJobOptions, jobId: indexJobId(r.id, r.updatedAt) },
      })),
    );
  }
}

const docSelect = {
  id: true,
  userId: true,
  campaignId: true,
  recipientEmail: true,
  status: true,
  scheduledAt: true,
  processedAt: true,
  updatedAt: true,
  failureReason: true,
  previewUrl: true,
  deferredCount: true,
  campaign: { select: { subject: true, body: true } },
  sender: { select: { email: true } },
} as const;

type DocRow = NonNullable<Awaited<ReturnType<typeof loadDocRow>>>;

function loadDocRow(emailId: string) {
  return prisma.email.findUnique({ where: { id: emailId }, select: docSelect });
}

export function toDoc(row: DocRow) {
  return {
    recipient_email: row.recipientEmail,
    subject: row.campaign.subject,
    body: row.campaign.body,
    status: row.status,
    user_id: row.userId,
    campaign_id: row.campaignId,
    sender_email: row.sender.email,
    failure_reason: row.failureReason,
    preview_url: row.previewUrl,
    deferred_count: row.deferredCount,
    scheduled_at: row.scheduledAt.toISOString(),
    processed_at: row.processedAt?.toISOString() ?? null,
    updated_at: row.updatedAt.toISOString(),
  };
}

/** Index the latest Postgres state of one email (upsert by _id; last state wins). */
export async function indexEmail(emailId: string): Promise<'indexed' | 'deleted'> {
  const row = await loadDocRow(emailId);
  if (!row) {
    await es.delete({ index: ES_INDEX, id: emailId }, { ignore: [404] });
    return 'deleted';
  }
  await es.index({ index: ES_INDEX, id: row.id, document: toDoc(row) });
  return 'indexed';
}

/** Full rebuild from Postgres (the source of truth). Used by `npm run es:reindex`. */
export async function reindexAll(onProgress?: (n: number) => void): Promise<number> {
  let cursor: string | undefined;
  let total = 0;
  for (;;) {
    const rows = await prisma.email.findMany({
      select: docSelect,
      orderBy: { id: 'asc' },
      take: CHUNK,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (rows.length === 0) break;
    const operations = rows.flatMap((r) => [{ index: { _index: ES_INDEX, _id: r.id } }, toDoc(r)]);
    const res = await es.bulk({ operations, refresh: false });
    if (res.errors) throw new Error('bulk indexing reported errors');
    total += rows.length;
    onProgress?.(total);
    cursor = rows[rows.length - 1]!.id;
  }
  await es.indices.refresh({ index: ES_INDEX });
  return total;
}
