import { format, isThisWeek, isToday, isTomorrow, isYesterday } from 'date-fns';

/** Chip format from the Figma: "Tue 9:15:12 AM"; falls back to a date outside this week. */
export function formatChip(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isToday(d)) return `Today ${format(d, 'h:mm:ss a')}`;
  if (isThisWeek(d, { weekStartsOn: 1 })) return format(d, 'EEE h:mm:ss a');
  return format(d, 'd MMM, h:mm a');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const time = format(d, 'h:mm a');
  if (isToday(d)) return `Today, ${time}`;
  if (isTomorrow(d)) return `Tomorrow, ${time}`;
  if (isYesterday(d)) return `Yesterday, ${time}`;
  return format(d, 'MMM d, h:mm a');
}

export function formatFull(iso: string): string {
  return format(new Date(iso), "EEEE, d MMMM yyyy 'at' h:mm:ss a");
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

export const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
