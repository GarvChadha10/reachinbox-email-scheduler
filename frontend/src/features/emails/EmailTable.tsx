import { CalendarClock, SearchX, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Pagination } from '../../components/ui/Pagination';
import { Table, type Column } from '../../components/ui/Table';
import { errorMessage } from '../../lib/api';
import { formatDateTime, formatFull } from '../../lib/format';
import { StatusBadge } from './StatusBadge';
import type { EmailRow, TabKey } from './types';
import { useEmailList } from './useEmails';

function columnsFor(tab: TabKey): Column<EmailRow>[] {
  return [
    {
      key: 'email',
      header: 'Email',
      width: 'minmax(0,1.3fr)',
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-ink">
            <span className="font-normal text-ink-subtle">To: </span>
            {r.recipient}
          </p>
          <p className="truncate text-xs text-ink-subtle">From {r.senderEmail}</p>
        </div>
      ),
    },
    { key: 'subject', header: 'Subject', width: 'minmax(0,1.5fr)', render: (r) => <p className="truncate text-sm text-ink-muted">{r.subject}</p> },
    {
      key: 'time',
      header: tab === 'scheduled' ? 'Scheduled time' : 'Sent time',
      width: '190px',
      render: (r) => (
        <time dateTime={r.time ?? undefined} title={r.time ? formatFull(r.time) : undefined} className="text-[13px] text-ink-muted tabular-nums">
          {formatDateTime(r.time)}
        </time>
      ),
    },
    { key: 'status', header: 'Status', width: '130px', className: 'flex justify-end', render: (r) => <StatusBadge row={r} /> },
  ];
}

const EMPTY = {
  scheduled: { icon: <CalendarClock className="size-6" />, title: 'No scheduled emails', description: 'Emails you schedule will wait here until it is their turn to send.' },
  sent: { icon: <Send className="size-6" />, title: 'No sent emails yet', description: 'Once your scheduled emails go out, you will see them here with their delivery status.' },
};

export function EmailTable({ tab, page, q, onPageChange }: { tab: TabKey; page: number; q: string; onPageChange: (p: number) => void }) {
  const query = useEmailList(tab, page, q);
  const searching = q.trim().length > 0;

  if (query.isError && !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  const empty = searching ? (
    <EmptyState icon={<SearchX className="size-6" />} title="No matches" description={`Nothing in ${tab === 'scheduled' ? 'Scheduled' : 'Sent'} matches “${q.trim()}”.`} />
  ) : (
    <EmptyState
      {...EMPTY[tab]}
      action={
        tab === 'scheduled' ? (
          <Link to="/compose">
            <Button tabIndex={-1}>Compose New Email</Button>
          </Link>
        ) : undefined
      }
    />
  );

  return (
    <>
      <Table caption={tab === 'scheduled' ? 'Scheduled emails' : 'Sent emails'} columns={columnsFor(tab)} rows={query.data?.items} rowKey={(r) => r.id} loading={query.isPending} empty={empty} />
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} pageSize={query.data.pageSize} onPageChange={onPageChange} />}
    </>
  );
}
