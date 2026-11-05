import clsx from 'clsx';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem<K extends string> {
  key: K;
  label: string;
  icon?: ReactNode;
  count?: number;
}

interface TabsProps<K extends string> {
  items: readonly TabItem<K>[];
  value: K;
  onChange: (key: K) => void;
  orientation?: 'horizontal' | 'vertical';
  ariaLabel: string;
  idPrefix: string;
}

/** WAI-ARIA tablist: roving tabindex, arrow keys / Home / End move focus and select. */
export function Tabs<K extends string>({ items, value, onChange, orientation = 'horizontal', ariaLabel, idPrefix }: TabsProps<K>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    const prev = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    let target = -1;
    if (e.key === next) target = (index + 1) % items.length;
    else if (e.key === prev) target = (index - 1 + items.length) % items.length;
    else if (e.key === 'Home') target = 0;
    else if (e.key === 'End') target = items.length - 1;
    if (target < 0) return;
    e.preventDefault();
    refs.current[target]?.focus();
    onChange(items[target]!.key);
  };

  return (
    <div role="tablist" aria-label={ariaLabel} aria-orientation={orientation} className={clsx('flex', orientation === 'vertical' ? 'flex-col gap-0.5' : 'gap-1 border-b border-line')}>
      {items.map((t, i) => {
        const selected = t.key === value;
        return (
          <button
            key={t.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            id={`${idPrefix}-tab-${t.key}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={clsx(
              'flex items-center gap-2.5 text-sm transition-colors',
              orientation === 'vertical'
                ? clsx('h-[38px] rounded-md px-4 text-[15px] text-ink', selected ? 'bg-brand-50 font-semibold' : 'hover:bg-hover')
                : clsx('-mb-px h-10 border-b-2 px-3', selected ? 'border-brand-500 font-semibold text-ink' : 'border-transparent text-ink-muted hover:text-ink'),
            )}
          >
            {t.icon}
            <span className="flex-1 text-left">{t.label}</span>
            {t.count !== undefined && <span className="text-xs font-normal text-ink-muted tabular-nums">{t.count.toLocaleString()}</span>}
          </button>
        );
      })}
    </div>
  );
}
