import { useMutation, useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { apiFetch, errorMessage } from '../../lib/api';
import { qk, queryClient } from '../../lib/queryClient';
import type { SlackStatus } from '../../types/api';

export function useSlackStatus() {
  return useQuery({ queryKey: qk.slack, queryFn: () => apiFetch<SlackStatus>('/slack/status') });
}

export function useDisconnectSlack() {
  return useMutation({
    mutationFn: () => apiFetch<void>('/slack/disconnect', { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Slack disconnected');
      void queryClient.invalidateQueries({ queryKey: qk.slack });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
}

export function useTestSlack() {
  return useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; status: string }>('/slack/test', { method: 'POST' }),
    onSuccess: (r) => (r.ok ? toast.success('Test message sent to Slack') : toast.error(`Slack returned ${r.status}`)),
    onError: (e) => toast.error(errorMessage(e)),
  });
}

/** Full-page navigation: the backend redirects to Slack's authorize URL (real OAuth). */
export const connectSlack = () => window.location.assign('/api/slack/connect');
