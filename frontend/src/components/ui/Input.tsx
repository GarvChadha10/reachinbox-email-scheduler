import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes } from 'react';

export type InputVariant = 'underline' | 'box' | 'filled';

const variants: Record<InputVariant, string> = {
  // Compose "Subject" / "To" rows
  underline: 'h-[46px] border-b border-line px-2.5 focus:border-brand-500',
  // Compose "Delay" / "Hourly Limit" boxes
  box: 'h-[42px] rounded-md border border-line px-3 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 aria-[invalid=true]:border-danger-600',
  // Login fields, search pill
  filled: 'h-[52px] rounded-md bg-field px-4 focus:ring-2 focus:ring-brand-100',
};

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: InputVariant;
  invalid?: boolean;
}

/** Bare input styled from the Figma tokens; pair it with a <label htmlFor>. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ variant = 'box', invalid, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={clsx('bg-transparent text-[16px] text-ink placeholder:text-ink-subtle focus:outline-none disabled:cursor-not-allowed', variants[variant], variant === 'filled' && 'bg-field', className)}
      {...rest}
    />
  );
});
