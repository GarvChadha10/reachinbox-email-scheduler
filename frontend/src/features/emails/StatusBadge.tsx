import { Clock3, Loader2 } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { formatChip, formatFull } from '../../lib/format';
import type { EmailRow } from './types';

const FAILURE_TEXT: Record<string, string> = {
  permanent: 'Rejected by the mail server',
  retries_exhausted: 'Temporary errors; retries exhausted',
  delivery_unconfirmed: 'Connection dropped mid-send; not retried to avoid duplicates',
  interrupted_unconfirmed: 'Worker stopped mid-send; not retried to avoid duplicates',
};

export function failureText(row: Pick<EmailRow, 'failureReason' | 'lastError'>): string {
  const base = (row.failureReason && FAILURE_TEXT[row.failureReason]) ?? 'Failed';
  return row.lastError ? `${base}: ${row.lastError}` : base;
}

/** Figma: scheduled rows show an orange clock chip with the send time; sent rows a grey "Sent" chip. */
export function StatusBadge({ row }: { row: EmailRow }) {
  switch (row.status) {
    case 'scheduled': {
      const deferred = row.deferredCount > 0;
      const title = row.time ? `Scheduled for ${formatFull(row.time)}${deferred ? ` · deferred ${row.deferredCount}× by the hourly limit` : ''}` : undefined;
      return (
        <Badge tone="warn" icon={<Clock3 className="size-3.5" />} title={title}>
          {formatChip(row.time)}
          {deferred && <span className="sr-only"> (deferred by hourly limit)</span>}
        </Badge>
      );
    }
    case 'sending':
      return (
        <Badge tone="info" icon={<Loader2 className="size-3.5 animate-spin" />}>
          Sending
        </Badge>
      );
    case 'sent':
      return <Badge tone="ok">Sent</Badge>;
    case 'failed': {
      const text = failureText(row);
      return (
        <span className="group relative inline-flex" tabIndex={0} aria-label={`Failed: ${text}`}>
          <Badge tone="danger">Failed</Badge>
          <span role="tooltip" className="pointer-events-none absolute top-full left-0 z-20 mt-1.5 w-64 rounded-md bg-ink px-2.5 py-2 text-xs leading-snug font-normal text-white opacity-0 shadow-pop transition-opacity group-hover:opacity-100 group-focus:opacity-100">
            {text}
          </span>
        </span>
      );
    }
    default:
      return <Badge>Cancelled</Badge>;
  }
}
