import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { apiFetch, ApiError } from '../../lib/api';
import { qk, queryClient } from '../../lib/queryClient';
import type { User } from '../../types/api';

/** null = not logged in. Uses silent401 so probing the session never triggers the global handler. */
export function useMe() {
  return useQuery({
    queryKey: qk.me,
    queryFn: async () => {
      try {
        return await apiFetch<User>('/auth/me', { silent401: true });
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogout() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: () => apiFetch<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(qk.me, null);
      navigate('/login', { replace: true });
    },
  });
}

type PasswordAuthInput = { mode: 'login'; email: string; password: string } | { mode: 'signup'; name: string; email: string; password: string };

/** Email + password login / sign-up. On success the session cookie is set and the dashboard opens. */
export function usePasswordAuth() {
  const navigate = useNavigate();
  return useMutation({
    mutationFn: ({ mode, ...body }: PasswordAuthInput) =>
      apiFetch<User>(mode === 'signup' ? '/auth/register' : '/auth/login', { method: 'POST', body, silent401: true }),
    onSuccess: (user) => {
      queryClient.setQueryData(qk.me, user);
      navigate('/dashboard', { replace: true });
    },
  });
}
