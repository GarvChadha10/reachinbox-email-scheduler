import { Clock3, Send } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Tabs, type TabItem } from '../components/ui/Tabs';
import { useEmailCounts } from '../features/emails/useEmails';
import type { TabKey } from '../features/emails/types';
import type { User } from '../types/api';
import { Logo } from './Logo';
import { ProfileMenu } from './ProfileMenu';

export function Sidebar({ user, tab, onTab }: { user: User; tab: TabKey | null; onTab: (t: TabKey) => void }) {
  const counts = useEmailCounts();
  const items: TabItem<TabKey>[] = [
    { key: 'scheduled', label: 'Scheduled', icon: <Clock3 className="size-[18px]" strokeWidth={1.8} />, count: counts.data?.scheduled },
    { key: 'sent', label: 'Sent', icon: <Send className="size-[18px]" strokeWidth={1.8} />, count: counts.data?.sent },
  ];
  return (
    <aside className="flex w-full shrink-0 flex-col gap-3 border-line px-2 pt-5 pb-4 md:w-[272px] md:border-r-0 md:pl-2 md:pr-0">
      <div className="px-3 pb-1">
        <Logo />
      </div>
      <ProfileMenu user={user} />
      <Link to="/compose" className="flex h-[38px] items-center justify-center rounded-pill border border-brand-500 text-[15px] font-medium text-brand-600 transition-colors hover:bg-brand-50">
        Compose
      </Link>
      <div className="mt-4">
        <p className="mb-2 px-4 text-xs tracking-wide text-ink-subtle uppercase">Core</p>
        <Tabs items={items} value={tab ?? ('' as TabKey)} onChange={onTab} orientation="vertical" ariaLabel="Mailboxes" idPrefix="mailbox" />
      </div>
    </aside>
  );
}
