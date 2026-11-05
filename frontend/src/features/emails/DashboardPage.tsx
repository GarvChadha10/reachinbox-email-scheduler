import { useIsFetching, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';
import { AppShell } from '../../layout/AppShell';
import { EmailTable } from './EmailTable';
import { ListToolbar } from './ListToolbar';
import type { StatusFilter, TabKey } from './types';

const SLACK_RESULT: Record<string, () => void> = {
  connected: () => toast.success('Slack connected. You will be notified when a sender hits its hourly limit.'),
  error: () => toast.error('Could not connect Slack. Please try again.'),
  denied: () => toast('Slack connection was cancelled.'),
};

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const tab: TabKey = params.get('tab') === 'sent' ? 'sent' : 'scheduled';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const q = params.get('q') ?? '';
  const status = (params.get('status') ?? '') as StatusFilter;
  const qc = useQueryClient();
  const fetching = useIsFetching({ queryKey: ['emails'] }) > 0;

  // Toast the Slack OAuth result once, then drop the param from the URL.
  useEffect(() => {
    const slack = params.get('slack');
    if (!slack) return;
    SLACK_RESULT[slack]?.();
    void qc.invalidateQueries({ queryKey: ['slack'] });
    setParams((p) => {
      p.delete('slack');
      return p;
    }, { replace: true });
  }, [params, setParams, qc]);

  const update = useCallback(
    (patch: Record<string, string>) =>
      setParams((p) => {
        for (const [k, v] of Object.entries(patch)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        if (!('page' in patch)) p.delete('page');
        return p;
      }),
    [setParams],
  );

  return (
    <AppShell tab={tab}>
      <ListToolbar
        tab={tab}
        q={q}
        onQ={(v) => update({ q: v })}
        status={status}
        onStatus={(s) => update({ status: s })}
        onRefresh={() => void qc.invalidateQueries({ queryKey: ['emails'] })}
        refreshing={fetching}
      />
      <section id="mailbox-panel" role="tabpanel" aria-labelledby={`mailbox-tab-${tab}`} className="pr-0 md:pr-4">
        <EmailTable key={tab} tab={tab} page={page} q={q} status={status} onPageChange={(p) => update({ page: String(p) })} />
      </section>
    </AppShell>
  );
}
