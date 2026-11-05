import type { ReactNode } from 'react';

/** Label + control + hint/error, shared by Input/Textarea so every field is labelled consistently. */
export function Field({ id, label, hint, error, children, inline }: { id: string; label: string; hint?: ReactNode; error?: string; children: ReactNode; inline?: boolean }) {
  return (
    <div className={inline ? 'flex items-center gap-3' : 'flex flex-col gap-1.5'}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-ink-subtle">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const controlClass =
  'w-full rounded-md border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-subtle transition-colors hover:border-line-strong focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger-600';
