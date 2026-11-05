import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './api';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2_000,
      refetchOnWindowFocus: true,
      // Never retry auth/validation failures; retry transient ones twice.
      retry: (count, err) => !(err instanceof ApiError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

export const qk = {
  me: ['me'] as const,
  scheduled: (page: number, status: string) => ['emails', 'scheduled', page, status] as const,
  sent: (page: number, status: string) => ['emails', 'sent', page, status] as const,
  email: (id: string) => ['emails', 'detail', id] as const,
  senders: ['senders'] as const,
  counts: ['emails', 'counts'] as const,
  search: (q: string, status: string, page: number) => ['emails', 'search', q, status, page] as const,
  slack: ['slack'] as const,
};
