import clsx from 'clsx';
import { Star } from 'lucide-react';

export function StarButton({ starred, onToggle, label }: { starred: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-pressed={starred}
      aria-label={starred ? `Unstar ${label}` : `Star ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      className={clsx('rounded-sm p-1 transition-colors', starred ? 'text-[#f5b300]' : 'text-line-strong hover:text-ink-subtle')}
    >
      <Star className="size-[18px]" fill={starred ? 'currentColor' : 'none'} strokeWidth={1.6} />
    </button>
  );
}
