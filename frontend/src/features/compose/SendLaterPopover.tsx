import clsx from 'clsx';
import { addDays, format, set } from 'date-fns';
import { CalendarDays } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { userTimeZone } from '../../lib/format';

export const toLocalInput = (d: Date) => format(d, "yyyy-MM-dd'T'HH:mm");

function presets(now: Date) {
  const tomorrow = addDays(now, 1);
  const at = (h: number) => set(tomorrow, { hours: h, minutes: 0, seconds: 0, milliseconds: 0 });
  return [
    { label: 'Tomorrow', date: set(tomorrow, { hours: 9, minutes: 0, seconds: 0, milliseconds: 0 }) },
    { label: 'Tomorrow, 10:00 AM', date: at(10) },
    { label: 'Tomorrow, 11:00 AM', date: at(11) },
    { label: 'Tomorrow, 3:00 PM', date: at(15) },
  ];
}

interface Props {
  open: boolean;
  value: Date | null;
  onDone: (d: Date) => void;
  onCancel: () => void;
}

/** Figma "Send Later" popover: date-time picker + quick presets, Cancel / Done. */
export function SendLaterPopover({ open, value, onDone, onCancel }: Props) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Default: the current choice, else now + 5 minutes.
    setDraft(toLocalInput(value ?? new Date(Date.now() + 5 * 60_000)));
    setError(null);
    panel.current?.querySelector<HTMLInputElement>('input')?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCancel();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, value, onCancel]);

  if (!open) return null;

  const done = () => {
    const d = new Date(draft);
    if (Number.isNaN(d.getTime())) return setError('Pick a valid date and time');
    if (d.getTime() < Date.now() - 60_000) return setError('That time is in the past');
    onDone(d);
  };

  return (
    <div ref={panel} role="dialog" aria-label="Send later" className="absolute top-full right-0 z-40 mt-3 w-[346px] rounded-lg border border-line bg-surface px-5 pt-5 pb-4 shadow-pop">
      <h2 className="text-[17px] font-medium">Send Later</h2>
      <label className="mt-4 flex items-center gap-2 border-b border-line pb-2">
        <span className="sr-only">Pick date & time</span>
        <input
          type="datetime-local"
          value={draft}
          min={toLocalInput(new Date())}
          onChange={(e) => {
            setDraft(e.target.value);
            setError(null);
          }}
          className="min-w-0 flex-1 bg-transparent text-sm text-ink focus:outline-none [&::-webkit-calendar-picker-indicator]:opacity-0"
        />
        <CalendarDays className="pointer-events-none size-[18px] text-ink-subtle" aria-hidden />
      </label>
      <p className={clsx('mt-1 text-xs', error ? 'text-danger-600' : 'text-ink-subtle')}>{error ?? `Times are in your timezone (${userTimeZone()})`}</p>
      <ul className="mt-3 space-y-0.5">
        {presets(new Date()).map((p) => (
          <li key={p.label}>
            <button
              type="button"
              onClick={() => setDraft(toLocalInput(p.date))}
              className={clsx('w-full rounded-sm py-2 text-left text-[15px] hover:text-brand-600', draft === toLocalInput(p.date) ? 'font-medium text-brand-600' : 'text-ink-muted')}
            >
              {p.label}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-6 flex items-center justify-end gap-5">
        <button type="button" onClick={onCancel} className="text-[15px] text-ink hover:text-ink-muted">
          Cancel
        </button>
        <button type="button" onClick={done} className="h-[38px] rounded-pill border border-brand-500 px-7 text-[15px] font-medium text-brand-600 hover:bg-brand-50">
          Done
        </button>
      </div>
    </div>
  );
}
