import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import { qk, queryClient } from '../../lib/queryClient';
import type { CreateCampaignRequest, CreateCampaignResponse, Sender } from '../../types/api';

export function useSenders() {
  return useQuery({ queryKey: qk.senders, queryFn: () => apiFetch<Sender[]>('/senders'), staleTime: 5 * 60_000 });
}

/** The Idempotency-Key is created once per Compose page visit and reused for every retry. */
export function useCreateCampaign(idempotencyKey: string) {
  return useMutation({
    mutationFn: (body: CreateCampaignRequest) =>
      apiFetch<CreateCampaignResponse>('/campaigns', { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['emails'] }),
  });
}
