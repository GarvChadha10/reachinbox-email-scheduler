import clsx from 'clsx';
import type { ReactNode } from 'react';

export type BadgeTone = 'warn' | 'ok' | 'danger' | 'info';

const tones: Record<BadgeTone, string> = {
  warn: 'bg-warn-50 border-warn-200 text-warn-700',
  ok: 'bg-ok-50 border-ok-200 text-ok-700',
  danger: 'bg-danger-50 border-danger-200 text-danger-700',
  info: 'bg-info-50 border-info-200 text-info-700',
};

/** Pill chip as in the Figma list rows (orange "Tue 9:15:12 AM", grey "Sent"). */
export function Badge({ tone = 'ok', icon, children, title }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={clsx('inline-flex h-6 shrink-0 items-center gap-1 rounded-pill border px-2 text-xs font-medium whitespace-nowrap tabular-nums', tones[tone])}>
      {icon}
      {children}
    </span>
  );
}
