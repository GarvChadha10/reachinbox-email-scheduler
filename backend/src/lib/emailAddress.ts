/** Pragmatic address check (not full RFC 5322): local@domain.tld, no spaces. */
export const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export interface NormalizedRecipients {
  valid: string[];
  invalidCount: number;
  duplicatesRemoved: number;
}

/** Trim, lower-case, validate and de-duplicate while preserving first-seen order. */
export function normalizeRecipients(input: readonly string[]): NormalizedRecipients {
  const seen = new Set<string>();
  const valid: string[] = [];
  let invalidCount = 0;
  let duplicatesRemoved = 0;
  for (const raw of input) {
    const e = raw.trim().toLowerCase();
    if (e.length > 254 || !EMAIL_RE.test(e)) {
      invalidCount++;
      continue;
    }
    if (seen.has(e)) {
      duplicatesRemoved++;
      continue;
    }
    seen.add(e);
    valid.push(e);
  }
  return { valid, invalidCount, duplicatesRemoved };
}
