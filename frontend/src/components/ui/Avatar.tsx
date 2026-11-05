import clsx from 'clsx';
import { useState } from 'react';
import { initials } from '../../lib/format';

/** Image avatar with an initials fallback when there is no URL or the image fails to load. */
export function Avatar({ name, src, size = 36, className }: { name: string; src?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  if (src && !failed) {
    return (
      <img src={src} alt={name} style={style} referrerPolicy="no-referrer" onError={() => setFailed(true)} className={clsx('shrink-0 rounded-full object-cover', className)} />
    );
  }
  return (
    <span aria-label={name} role="img" style={style} className={clsx('inline-flex shrink-0 items-center justify-center rounded-full bg-brand-100 font-semibold text-brand-700', className)}>
      {initials(name)}
    </span>
  );
}
