import { Hash } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { Skeleton } from '../../components/ui/Skeleton';
import { connectSlack, useDisconnectSlack, useSlackStatus, useTestSlack } from './useSlack';

export function SlackLogo({ className = 'size-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#E01E5A" d="M5 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5z" />
      <path fill="#36C5F0" d="M9 5a2 2 0 1 1 2-2v2H9zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5z" />
      <path fill="#2EB67D" d="M19 9a2 2 0 1 1 2 2h-2V9zm-1 0a2 2 0 1 1-4 0V4a2 2 0 1 1 4 0v5z" />
      <path fill="#ECB22E" d="M15 19a2 2 0 1 1-2 2v-2h2zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5z" />
    </svg>
  );
}

export function SlackModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const status = useSlackStatus();
  const disconnect = useDisconnectSlack();
  const test = useTestSlack();
  const s = status.data;

  return (
    <Modal open={open} onClose={onClose} title="Slack notifications">
      <div className="flex gap-3">
        <SlackLogo className="mt-0.5 size-6 shrink-0" />
        <p className="text-sm text-ink-muted">Get a Slack message the moment a sender hits its hourly limit and emails are pushed to the next hour.</p>
      </div>
      <div className="mt-4 rounded-md border border-line p-3">
        {status.isPending ? (
          <Skeleton className="h-4 w-1/2" />
        ) : s?.connected ? (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium">
                <span className="size-2 rounded-full bg-brand-500" aria-hidden />
                Connected{s.teamName ? ` to ${s.teamName}` : ''}
              </p>
              {s.channelName && (
                <p className="mt-0.5 flex items-center gap-1 text-xs text-ink-subtle">
                  <Hash className="size-3" />
                  {s.channelName.replace(/^#/, '')}
                </p>
              )}
            </div>
            <Button size="sm" variant="secondary" loading={test.isPending} onClick={() => test.mutate()}>
              Send test
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-sm text-ink-muted">
            <span className="size-2 rounded-full bg-line-strong" aria-hidden />
            Not connected
          </p>
        )}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        {s?.connected ? (
          <>
            <Button variant="ghost" onClick={connectSlack}>
              Reconnect
            </Button>
            <Button variant="danger" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>
              Disconnect
            </Button>
          </>
        ) : (
          <Button onClick={connectSlack} leftIcon={<SlackLogo className="size-4" />} variant="outline">
            Connect Slack
          </Button>
        )}
      </div>
    </Modal>
  );
}
