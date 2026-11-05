import { CalendarClock, SearchX, Send } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState } from '../../components/ui/ErrorState';
import { Pagination } from '../../components/ui/Pagination';
import { StarButton } from '../../components/ui/StarButton';
import { Table, type Column } from '../../components/ui/Table';
import { errorMessage } from '../../lib/api';
import { formatDateTime, formatFull } from '../../lib/format';
import { useStarred } from '../../lib/useStarred';
import { StatusBadge } from './StatusBadge';
import type { EmailRow, StatusFilter, TabKey } from './types';
import { useEmailList } from './useEmails';

function columnsFor(tab: TabKey, star: ReturnType<typeof useStarred>): Column<EmailRow>[] {
  const cols: Column<EmailRow>[] = [
    {
      key: 'email',
      header: 'Email',
      width: 'minmax(140px,224px)',
      render: (r) => (
        <p className="truncate text-[15px] text-ink" title={`${r.recipient} · from ${r.senderEmail}`}>
          To: {r.recipient}
        </p>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      width: 'auto',
      render: (r) => <StatusBadge row={r} />,
    },
    {
      key: 'subject',
      header: 'Subject',
      width: 'minmax(0,1fr)',
      skeletonClass: 'h-3.5 w-2/3',
      render: (r) => (
        <p className="truncate text-[15px]">
          <span className="font-medium text-ink">{r.subject}</span>
          {r.bodyPreview && <span className="text-ink-subtle"> - {r.bodyPreview}</span>}
        </p>
      ),
    },
  ];
  if (tab === 'sent') {
    cols.push({
      key: 'time',
      header: 'Sent time',
      width: '128px',
      className: 'text-right',
      render: (r) => (
        <time dateTime={r.time ?? undefined} title={r.time ? formatFull(r.time) : undefined} className="text-[13px] text-ink-subtle tabular-nums">
          {formatDateTime(r.time)}
        </time>
      ),
    });
  }
  cols.push({
    key: 'star',
    header: 'Star',
    width: '32px',
    className: 'flex justify-end',
    skeletonClass: 'size-4',
    render: (r) => <StarButton starred={star.isStarred(r.id)} onToggle={() => star.toggle(r.id)} label={r.subject} />,
  });
  return cols;
}

const EMPTY = {
  scheduled: { icon: <CalendarClock className="size-6" />, title: 'No scheduled emails', description: 'Emails you schedule wait here until it is their turn to send.' },
  sent: { icon: <Send className="size-6" />, title: 'No sent emails yet', description: 'Once scheduled emails go out, they show up here with their delivery status.' },
};

interface Props {
  tab: TabKey;
  page: number;
  q: string;
  status: StatusFilter;
  onPageChange: (p: number) => void;
}

export function EmailTable({ tab, page, q, status, onPageChange }: Props) {
  const query = useEmailList(tab, page, q, status);
  const star = useStarred();
  const navigate = useNavigate();
  const filtered = q.trim().length > 0 || status !== '';

  if (query.isError && !query.data) {
    return <ErrorState message={errorMessage(query.error)} onRetry={() => void query.refetch()} retrying={query.isFetching} />;
  }

  const empty = filtered ? (
    <EmptyState icon={<SearchX className="size-6" />} title="No matches" description={q.trim() ? `Nothing in ${tab === 'scheduled' ? 'Scheduled' : 'Sent'} matches “${q.trim()}”.` : 'No emails match this filter.'} />
  ) : (
    <EmptyState
      {...EMPTY[tab]}
      action={
        tab === 'scheduled' ? (
          <Link to="/compose" className="inline-flex h-9 items-center rounded-pill border border-brand-500 px-5 text-sm font-medium text-brand-600 hover:bg-brand-50">
            Compose
          </Link>
        ) : undefined
      }
    />
  );

  return (
    <>
      <Table
        caption={tab === 'scheduled' ? 'Scheduled emails' : 'Sent emails'}
        columns={columnsFor(tab, star)}
        rows={query.data?.items}
        rowKey={(r) => r.id}
        rowLabel={(r) => `To ${r.recipient}: ${r.subject}`}
        onRowClick={(r) => navigate(`/emails/${r.id}`)}
        loading={query.isPending}
        empty={empty}
        visuallyHiddenHeader
      />
      {query.data && <Pagination page={query.data.page} totalPages={query.data.totalPages} total={query.data.total} pageSize={query.data.pageSize} onPageChange={onPageChange} />}
    </>
  );
}

