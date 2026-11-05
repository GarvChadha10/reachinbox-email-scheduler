import type { estypes } from '@elastic/elasticsearch';
import { es, ES_INDEX } from './es.js';
import { toPage, type Pagination } from '../../lib/pagination.js';

export const STATUS_GROUPS = {
  scheduled: ['scheduled', 'sending'],
  sent: ['sent', 'failed'],
} as const;

export interface SearchParams extends Pagination {
  q: string;
  status?: string[];
}

interface Doc {
  recipient_email: string;
  subject: string;
  status: string;
  sender_email: string;
  scheduled_at: string;
  processed_at: string | null;
  failure_reason: string | null;
  preview_url: string | null;
  deferred_count: number;
}

/** Always filtered by user_id: a user can only ever search their own emails. */
export async function searchEmails(userId: string, params: SearchParams) {
  const filter: estypes.QueryDslQueryContainer[] = [{ term: { user_id: userId } }];
  if (params.status?.length) filter.push({ terms: { status: params.status } });
  const must: estypes.QueryDslQueryContainer[] = params.q
    ? [
        {
          multi_match: {
            query: params.q,
            type: 'bool_prefix',
            fields: ['recipient_email', 'recipient_email._2gram', 'recipient_email._3gram', 'subject^2', 'body'],
          },
        },
      ]
    : [{ match_all: {} }];

  const res = await es.search<Doc>({
    index: ES_INDEX,
    from: (params.page - 1) * params.pageSize,
    size: params.pageSize,
    track_total_hits: true,
    query: { bool: { filter, must } },
    sort: params.q ? ['_score', { scheduled_at: 'asc' }] : [{ scheduled_at: 'asc' }],
  });
  const total = typeof res.hits.total === 'number' ? res.hits.total : (res.hits.total?.value ?? 0);
  const items = res.hits.hits.map((h) => {
    const d = h._source!;
    return {
      id: h._id!,
      recipient: d.recipient_email,
      subject: d.subject,
      status: d.status,
      senderEmail: d.sender_email,
      scheduledAt: d.scheduled_at,
      sentAt: d.processed_at,
      failureReason: d.failure_reason,
      previewUrl: d.preview_url,
      deferredCount: d.deferred_count,
    };
  });
  return toPage(items, total, params);
}
