import clsx from 'clsx';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { controlClass, Field } from './Field';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  hideLabel?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ id, label, hint, error, className, hideLabel, ...rest }, ref) {
  const input = (
    <input
      ref={ref}
      id={id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      aria-label={hideLabel ? label : undefined}
      className={clsx(controlClass, 'h-9', className)}
      {...rest}
    />
  );
  if (hideLabel) return input;
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      {input}
    </Field>
  );
});
