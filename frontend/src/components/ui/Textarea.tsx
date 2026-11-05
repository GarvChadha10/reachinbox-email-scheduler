import clsx from 'clsx';
import { forwardRef, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { controlClass, Field } from './Field';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ id, label, hint, error, className, ...rest }, ref) {
  return (
    <Field id={id} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
        className={clsx(controlClass, 'min-h-40 resize-y py-2.5 leading-relaxed', className)}
        {...rest}
      />
    </Field>
  );
});
