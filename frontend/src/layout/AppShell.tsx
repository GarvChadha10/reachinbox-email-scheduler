import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMe } from '../features/auth/useAuth';
import type { TabKey } from '../features/emails/types';
import { Sidebar } from './Sidebar';

/** Sidebar + main column. Used by the dashboard and the email detail page. */
export function AppShell({ tab, children }: { tab: TabKey | null; children: ReactNode }) {
  const me = useMe();
  const navigate = useNavigate();
  if (!me.data) return null; // RequireAuth guarantees a user
  return (
    <div className="flex min-h-full flex-col bg-surface md:flex-row">
      <Sidebar user={me.data} tab={tab} onTab={(t) => navigate(`/dashboard?tab=${t}`)} />
      <main className="min-w-0 flex-1 px-0 md:pl-5">{children}</main>
    </div>
  );
}
