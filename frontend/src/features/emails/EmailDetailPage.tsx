import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Avatar } from '../../components/ui/Avatar';
import { ErrorState } from '../../components/ui/ErrorState';
import { Skeleton } from '../../components/ui/Skeleton';
import { StarButton } from '../../components/ui/StarButton';
import { errorMessage } from '../../lib/api';
import { formatDateTime, formatFull } from '../../lib/format';
import { useStarred } from '../../lib/useStarred';
import { useMe } from '../auth/useAuth';
import { StatusBadge } from './StatusBadge';
import { useEmailDetail } from './useEmails';

/** Figma "email view": back arrow + subject, sender block, body. */
export function EmailDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const email = useEmailDetail(id);
  const me = useMe();
  const star = useStarred();
  const e = email.data;
  const back = () => (window.history.length > 1 ? navigate(-1) : navigate(`/dashboard?tab=${e?.status === 'sent' || e?.status === 'failed' ? 'sent' : 'scheduled'}`));

  return (
    <div className="min-h-full bg-surface">
      <header className="flex items-center gap-4 px-5 py-6 sm:px-6">
        <button type="button" onClick={back} aria-label="Back to list" className="rounded-sm p-1 text-ink hover:bg-hover">
          <ArrowLeft className="size-6" strokeWidth={1.6} />
        </button>
        <h1 className="min-w-0 flex-1 truncate text-[26px] leading-tight text-ink">{e ? e.subject : email.isPending ? <Skeleton className="h-7 w-80" /> : 'Email'}</h1>
        {e && <StarButton starred={star.isStarred(e.id)} onToggle={() => star.toggle(e.id)} label={e.subject} />}
        {me.data && (
          <>
            <span className="h-8 w-px bg-line" aria-hidden />
            <Avatar name={me.data.name} src={me.data.avatarUrl} size={34} />
          </>
        )}
      </header>

      {email.isError ? (
        <ErrorState message={errorMessage(email.error)} onRetry={() => void email.refetch()} retrying={email.isFetching} />
      ) : !e ? (
        <div className="mx-auto max-w-[1130px] space-y-3 px-6 pt-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : (
        <article className="mx-auto flex max-w-[1130px] gap-4 px-5 pb-16 sm:px-6">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-500 text-lg font-medium text-white" aria-hidden>
            {e.senderName.trim()[0]?.toUpperCase() ?? 'S'}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1">
              <div className="min-w-0">
                <p className="truncate text-[17px]">
                  <span className="font-semibold">{e.senderName}</span> <span className="text-sm text-ink-muted">&lt;{e.senderEmail}&gt;</span>
                </p>
                <p className="text-sm text-ink-muted">to {e.recipient}</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-ink-muted">
                <StatusBadge row={{ ...e, bodyPreview: '', time: e.status === 'sent' || e.status === 'failed' ? e.sentAt : e.scheduledAt }} />
                <time dateTime={e.sentAt ?? e.scheduledAt} title={formatFull(e.sentAt ?? e.scheduledAt)}>
                  {formatDateTime(e.sentAt ?? e.scheduledAt)}
                </time>
              </div>
            </div>

            <div className="mt-7 text-[17px] leading-[1.75] whitespace-pre-wrap text-ink">{e.body}</div>

            <dl className="mt-10 grid max-w-xl grid-cols-[140px_1fr] gap-x-4 gap-y-1.5 border-t border-line pt-5 text-[13px]">
              <dt className="text-ink-subtle">Scheduled for</dt>
              <dd>{formatFull(e.scheduledAt)}</dd>
              {e.sentAt && (
                <>
                  <dt className="text-ink-subtle">{e.status === 'failed' ? 'Failed at' : 'Sent at'}</dt>
                  <dd>{formatFull(e.sentAt)}</dd>
                </>
              )}
              {e.deferredCount > 0 && (
                <>
                  <dt className="text-ink-subtle">Deferred</dt>
                  <dd>{e.deferredCount}× by the hourly limit</dd>
                </>
              )}
              {e.messageId && (
                <>
                  <dt className="text-ink-subtle">Message-ID</dt>
                  <dd className="truncate font-mono text-xs">{e.messageId}</dd>
                </>
              )}
              {e.previewUrl && (
                <>
                  <dt className="text-ink-subtle">Ethereal preview</dt>
                  <dd>
                    <a href={e.previewUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                      Open message <ExternalLink className="size-3.5" />
                    </a>
                  </dd>
                </>
              )}
            </dl>
          </div>
        </article>
      )}
    </div>
  );
}
