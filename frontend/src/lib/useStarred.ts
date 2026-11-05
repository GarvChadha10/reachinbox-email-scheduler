import { useCallback, useSyncExternalStore } from 'react';

/** Stars are a per-browser convenience (not part of the scheduling domain), kept in localStorage. */
const KEY = 'starred-emails';
const listeners = new Set<() => void>();

function read(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
let snapshot = read();

function write(next: Set<string>) {
  snapshot = next;
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]));
  } catch {
    /* storage unavailable: keep in memory */
  }
  listeners.forEach((l) => l());
}

export function useStarred() {
  const starred = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
  );
  const toggle = useCallback((id: string) => {
    const next = new Set(snapshot);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    write(next);
  }, []);
  return { isStarred: (id: string) => starred.has(id), toggle };
}
