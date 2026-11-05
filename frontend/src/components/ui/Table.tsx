import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** CSS grid track, e.g. 'minmax(0,1fr)' or '140px'. */
  width: string;
  className?: string;
  skeletonClass?: string;
}

interface TableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  rowLabel?: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  skeletonRows?: number;
  empty?: ReactNode;
  caption: string;
  /** Figma shows a header-less list; headers stay available to screen readers. */
  visuallyHiddenHeader?: boolean;
}

/** Generic, typed table rendered as a CSS grid. One implementation serves Scheduled, Sent and search. */
export function Table<T>({ columns, rows, rowKey, rowLabel, onRowClick, loading, skeletonRows = 8, empty, caption, visuallyHiddenHeader }: TableProps<T>) {
  const template = columns.map((c) => c.width).join(' ');
  const rowClass = 'grid min-h-[61px] items-center gap-3 border-b border-line px-6';
  return (
    <div role="table" aria-label={caption} aria-busy={loading || undefined} className="w-full">
      <div role="rowgroup" className={visuallyHiddenHeader ? 'sr-only' : undefined}>
        <div role="row" className={clsx(rowClass, 'min-h-0 py-2.5')} style={{ gridTemplateColumns: template }}>
          {columns.map((c) => (
            <div role="columnheader" key={c.key} className="text-xxs font-semibold tracking-wide text-ink-subtle uppercase">
              {c.header}
            </div>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {loading
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <div role="row" key={i} className={rowClass} style={{ gridTemplateColumns: template }}>
                {columns.map((c) => (
                  <div role="cell" key={c.key}>
                    <Skeleton className={c.skeletonClass ?? 'h-3.5 w-3/4'} />
                  </div>
                ))}
              </div>
            ))
          : rows && rows.length > 0
            ? rows.map((row) => (
                <div
                  role="row"
                  key={rowKey(row)}
                  aria-label={rowLabel?.(row)}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.target === e.currentTarget && e.key === 'Enter') onRowClick(row);
                        }
                      : undefined
                  }
                  className={clsx(rowClass, onRowClick && 'cursor-pointer transition-colors hover:bg-hover focus-visible:bg-hover')}
                  style={{ gridTemplateColumns: template }}
                >
                  {columns.map((c) => (
                    <div role="cell" key={c.key} className={clsx('min-w-0', c.className)}>
                      {c.render(row)}
                    </div>
                  ))}
                </div>
              ))
            : empty}
      </div>
    </div>
  );
}
