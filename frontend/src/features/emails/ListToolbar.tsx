import clsx from 'clsx';
import { Filter, RotateCw, Search, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { StatusFilter, TabKey } from './types';

const FILTERS: Record<TabKey, { value: StatusFilter; label: string }[]> = {
  scheduled: [
    { value: '', label: 'All scheduled' },
    { value: 'scheduled', label: 'Waiting' },
    { value: 'sending', label: 'Sending now' },
  ],
  sent: [
    { value: '', label: 'All sent' },
    { value: 'sent', label: 'Delivered' },
    { value: 'failed', label: 'Failed' },
  ],
};

interface Props {
  tab: TabKey;
  q: string;
  onQ: (q: string) => void;
  status: StatusFilter;
  onStatus: (s: StatusFilter) => void;
  onRefresh: () => void;
  refreshing: boolean;
}

/** Figma toolbar: search pill (Elasticsearch, debounced) + filter + refresh. */
export function ListToolbar({ tab, q, onQ, status, onStatus, onRefresh, refreshing }: Props) {
  const [draft, setDraft] = useState(q);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => setDraft(q), [q]);
  useEffect(() => {
    if (draft === q) return;
    const t = setTimeout(() => onQ(draft), 300);
    return () => clearTimeout(t);
  }, [draft, q, onQ]);
  useEffect(() => {
    if (!filterOpen) return;
    const close = (e: MouseEvent) => !filterRef.current?.contains(e.target as Node) && setFilterOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setFilterOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [filterOpen]);

  const iconBtn = 'relative flex size-9 items-center justify-center rounded-pill text-ink-muted transition-colors hover:bg-hover hover:text-ink';

  return (
    <div className="flex items-center gap-4 pt-5 pr-6 pb-3">
      <div className="relative w-full max-w-[728px]">
        <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-ink-subtle" aria-hidden />
        <input
          type="search"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Search"
          aria-label="Search emails by recipient, subject or content"
          className="h-[42px] w-full rounded-pill bg-field pr-10 pl-11 text-[15px] placeholder:text-ink-subtle focus:ring-2 focus:ring-brand-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
        />
        {draft && (
          <button type="button" onClick={() => onQ('')} aria-label="Clear search" className="absolute top-1/2 right-3 -translate-y-1/2 rounded-sm p-0.5 text-ink-subtle hover:text-ink">
            <X className="size-4" />
          </button>
        )}
      </div>

      <div ref={filterRef} className="relative">
        <button type="button" className={iconBtn} aria-label="Filter by status" aria-haspopup="listbox" aria-expanded={filterOpen} onClick={() => setFilterOpen((o) => !o)}>
          <Filter className="size-[18px]" strokeWidth={1.6} />
          {status && <span className="absolute top-1.5 right-1.5 size-2 rounded-full bg-brand-500" aria-hidden />}
        </button>
        {filterOpen && (
          <ul role="listbox" aria-label="Status filter" className="absolute top-full right-0 z-30 mt-1.5 w-44 rounded-md border border-line bg-surface p-1.5 shadow-pop">
            {FILTERS[tab].map((f) => (
              <li key={f.value || 'all'}>
                <button
                  type="button"
                  role="option"
                  aria-selected={status === f.value}
                  onClick={() => {
                    onStatus(f.value);
                    setFilterOpen(false);
                  }}
                  className={clsx('w-full rounded-sm px-2.5 py-2 text-left text-sm hover:bg-hover', status === f.value ? 'font-semibold text-brand-700' : 'text-ink')}
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <button type="button" className={iconBtn} aria-label="Refresh" onClick={onRefresh}>
        <RotateCw className={clsx('size-[18px]', refreshing && 'animate-spin')} strokeWidth={1.6} />
      </button>
    </div>
  );
}
