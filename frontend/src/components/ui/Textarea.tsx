import clsx from 'clsx';
import { forwardRef, type TextareaHTMLAttributes } from 'react';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={clsx('block w-full resize-y bg-transparent text-[16px] leading-relaxed text-ink placeholder:text-ink-subtle focus:outline-none', className)} {...rest} />;
});
