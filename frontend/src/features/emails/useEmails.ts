import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import type { EmailDetail, Page, ScheduledEmail, SearchHit, SentEmail } from '../../types/api';
import type { EmailRow, StatusFilter, TabKey } from './types';

export const PAGE_SIZE = 20;
/** Polling keeps the lists live; simpler and sufficient compared to WebSockets/SSE here. */
export const REFRESH_MS = 5_000;

const fromScheduled = (e: ScheduledEmail): EmailRow => ({
  id: e.id,
  recipient: e.recipient,
  subject: e.subject,
  bodyPreview: e.bodyPreview,
  time: e.scheduledAt,
  status: e.status,
  senderEmail: e.senderEmail,
  deferredCount: e.deferredCount,
  failureReason: null,
  lastError: null,
  previewUrl: null,
});

const fromSent = (e: SentEmail): EmailRow => ({
  id: e.id,
  recipient: e.recipient,
  subject: e.subject,
  bodyPreview: e.bodyPreview,
  time: e.sentAt,
  status: e.status,
  senderEmail: e.senderEmail,
  deferredCount: 0,
  failureReason: e.failureReason,
  lastError: e.lastError,
  previewUrl: e.previewUrl,
});

const fromHit = (tab: TabKey) => (h: SearchHit): EmailRow => ({
  id: h.id,
  recipient: h.recipient,
  subject: h.subject,
  bodyPreview: h.bodyPreview,
  time: tab === 'sent' ? h.sentAt : h.scheduledAt,
  status: h.status,
  senderEmail: h.senderEmail,
  deferredCount: h.deferredCount,
  failureReason: h.failureReason,
  lastError: null,
  previewUrl: h.previewUrl,
});

const mapPage = <A, B>(p: Page<A>, f: (a: A) => B): Page<B> => ({ ...p, items: p.items.map(f) });

/** One hook for every list on the dashboard: Scheduled, Sent, or an Elasticsearch search within a tab. */
export function useEmailList(tab: TabKey, page: number, q: string, status: StatusFilter) {
  const searching = q.trim().length > 0;
  return useQuery({
    queryKey: searching ? qk.search(q.trim(), status || tab, page) : tab === 'scheduled' ? qk.scheduled(page, status) : qk.sent(page, status),
    queryFn: async ({ signal }): Promise<Page<EmailRow>> => {
      if (searching) {
        const params = new URLSearchParams({ q: q.trim(), status: status || tab, page: String(page), pageSize: String(PAGE_SIZE) });
        return mapPage(await apiFetch<Page<SearchHit>>(`/emails/search?${params}`, { signal }), fromHit(tab));
      }
      const params = `page=${page}&pageSize=${PAGE_SIZE}${status ? `&status=${status}` : ''}`;
      return tab === 'scheduled'
        ? mapPage(await apiFetch<Page<ScheduledEmail>>(`/emails/scheduled?${params}`, { signal }), fromScheduled)
        : mapPage(await apiFetch<Page<SentEmail>>(`/emails/sent?${params}`, { signal }), fromSent);
    },
    placeholderData: keepPreviousData,
    refetchInterval: REFRESH_MS,
  });
}

export function useEmailCounts() {
  return useQuery({
    queryKey: qk.counts,
    queryFn: async () => {
      const [s, d] = await Promise.all([
        apiFetch<Page<ScheduledEmail>>('/emails/scheduled?page=1&pageSize=1'),
        apiFetch<Page<SentEmail>>('/emails/sent?page=1&pageSize=1'),
      ]);
      return { scheduled: s.total, sent: d.total };
    },
    refetchInterval: REFRESH_MS,
  });
}

export function useEmailDetail(id: string) {
  return useQuery({
    queryKey: qk.email(id),
    queryFn: ({ signal }) => apiFetch<EmailDetail>(`/emails/${id}`, { signal }),
    // Keep polling while the email can still change state.
    refetchInterval: (q) => (q.state.data && ['sent', 'failed', 'cancelled'].includes(q.state.data.status) ? false : REFRESH_MS),
  });
}
