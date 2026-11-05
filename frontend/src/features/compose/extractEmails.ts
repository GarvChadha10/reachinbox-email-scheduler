import Papa from 'papaparse';

export const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;
/** Candidate tokens: anything with an @ between non-separator characters. */
const CANDIDATE_RE = /[^\s,;<>"'()[\]{}|]+@[^\s,;<>"'()[\]{}|]+/g;

export interface Extraction {
  emails: string[];
  invalid: string[];
  duplicates: number;
}

/** Validate + lower-case + de-duplicate tokens, preserving first-seen order. */
export function collect(tokens: Iterable<string>, existing: readonly string[] = []): Extraction {
  const seen = new Set(existing);
  const emails: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;
  for (const raw of tokens) {
    const t = raw.trim().replace(/^mailto:/i, '').replace(/[.]+$/, '').toLowerCase();
    if (!t) continue;
    if (!EMAIL_RE.test(t) || t.length > 254) {
      invalid.push(raw.trim());
      continue;
    }
    if (seen.has(t)) {
      duplicates++;
      continue;
    }
    seen.add(t);
    emails.push(t);
  }
  return { emails, invalid, duplicates };
}

/** Every email-looking token in a string (cells, plain lines, "Name <a@b.c>" forms). */
export function tokensIn(text: string): string[] {
  return text.match(CANDIDATE_RE) ?? [];
}

/**
 * Extract addresses from CSV or plain text: every column of every row is scanned, so header rows,
 * name columns and odd layouts all work. Parsing happens entirely in the browser.
 */
export function extractEmailsFromText(text: string, existing: readonly string[] = []): Extraction {
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
  const cells = parsed.data.flat().filter((c): c is string => typeof c === 'string');
  return collect(cells.flatMap(tokensIn), existing);
}

export async function extractEmailsFromFile(file: File, existing: readonly string[] = []): Promise<Extraction> {
  return extractEmailsFromText(await file.text(), existing);
}
