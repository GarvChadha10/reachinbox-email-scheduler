import clsx from 'clsx';
import { ChevronDown, LayoutList, LogOut } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Avatar } from '../components/ui/Avatar';
import { useLogout } from '../features/auth/useAuth';
import { SlackLogo, SlackModal } from '../features/slack/SlackModal';
import { useSlackStatus } from '../features/slack/useSlack';
import type { User } from '../types/api';

/** Figma profile card; opens a menu with Slack, the queue dashboard and Logout. */
export function ProfileMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [slackOpen, setSlackOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const items = useRef<(HTMLElement | null)[]>([]);
  const logout = useLogout();
  const slack = useSlackStatus();

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const onMenuKey = (e: KeyboardEvent) => {
    const list = items.current.filter(Boolean) as HTMLElement[];
    const i = list.indexOf(document.activeElement as HTMLElement);
    if (e.key === 'Escape') {
      setOpen(false);
      root.current?.querySelector<HTMLButtonElement>('button')?.focus();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = list.length;
      list[(i + (e.key === 'ArrowDown' ? 1 : n - 1)) % n]?.focus();
    }
  };

  const itemClass = 'flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-sm text-ink hover:bg-hover focus:bg-hover focus:outline-none';

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2.5 rounded-lg bg-field px-3 py-3 text-left transition-colors hover:bg-hover"
      >
        <Avatar name={user.name} src={user.avatarUrl} size={36} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] leading-5 text-ink">{user.name}</span>
          <span className="block truncate text-[11px] leading-4 text-ink-muted">{user.email}</span>
        </span>
        <ChevronDown className={clsx('size-4 shrink-0 text-ink-subtle transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div role="menu" aria-label="Account" onKeyDown={onMenuKey} className="absolute top-full right-0 left-0 z-30 mt-1.5 rounded-md border border-line bg-surface p-1.5 shadow-pop">
          <button
            ref={(el) => {
              items.current[0] = el;
            }}
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => {
              setOpen(false);
              setSlackOpen(true);
            }}
          >
            <SlackLogo className="size-4" />
            <span className="flex-1">Slack</span>
            <span className={clsx('text-xs', slack.data?.connected ? 'text-brand-600' : 'text-ink-subtle')}>{slack.data?.connected ? 'Connected' : 'Connect'}</span>
          </button>
          <a
            ref={(el) => {
              items.current[1] = el;
            }}
            role="menuitem"
            href="/admin/queues"
            target="_blank"
            rel="noreferrer"
            className={itemClass}
            onClick={() => setOpen(false)}
          >
            <LayoutList className="size-4 text-ink-muted" />
            Queue dashboard
          </a>
          <div className="my-1 h-px bg-line" />
          <button
            ref={(el) => {
              items.current[2] = el;
            }}
            role="menuitem"
            type="button"
            className={itemClass}
            onClick={() => logout.mutate()}
          >
            <LogOut className="size-4 text-ink-muted" />
            Logout
          </button>
        </div>
      )}
      <SlackModal open={slackOpen} onClose={() => setSlackOpen(false)} />
    </div>
  );
}
