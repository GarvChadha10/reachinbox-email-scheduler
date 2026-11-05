import clsx from 'clsx';
import type { ReactNode } from 'react';
import { Skeleton } from './Skeleton';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** CSS grid track, e.g. 'minmax(0,2fr)' or '140px'. */
  width: string;
  className?: string;
}

interface TableProps<T> {
  columns: readonly Column<T>[];
  rows: readonly T[] | undefined;
  rowKey: (row: T) => string;
  loading?: boolean;
  skeletonRows?: number;
  empty?: ReactNode;
  caption: string;
}

/** Generic, typed table. One implementation renders both the Scheduled and Sent lists. */
export function Table<T>({ columns, rows, rowKey, loading, skeletonRows = 8, empty, caption }: TableProps<T>) {
  const template = columns.map((c) => c.width).join(' ');
  return (
    <div role="table" aria-label={caption} aria-busy={loading || undefined} className="w-full">
      <div role="rowgroup">
        <div role="row" className="grid items-center gap-4 border-b border-line px-5 py-2.5" style={{ gridTemplateColumns: template }}>
          {columns.map((c) => (
            <div role="columnheader" key={c.key} className={clsx('text-xxs font-semibold tracking-wide text-ink-subtle uppercase', c.className)}>
              {c.header}
            </div>
          ))}
        </div>
      </div>
      <div role="rowgroup">
        {loading
          ? Array.from({ length: skeletonRows }, (_, i) => (
              <div role="row" key={i} className="grid items-center gap-4 border-b border-line px-5 py-4" style={{ gridTemplateColumns: template }}>
                {columns.map((c) => (
                  <div role="cell" key={c.key}>
                    <Skeleton className="h-3.5 w-3/4" />
                  </div>
                ))}
              </div>
            ))
          : rows && rows.length > 0
            ? rows.map((row) => (
                <div role="row" key={rowKey(row)} className="grid items-center gap-4 border-b border-line px-5 py-3.5 transition-colors hover:bg-canvas" style={{ gridTemplateColumns: template }}>
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
