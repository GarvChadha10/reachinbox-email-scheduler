import { describe, expect, it } from 'vitest';
import { normalizeRecipients } from '../../src/lib/emailAddress.js';

describe('normalizeRecipients', () => {
  it('trims, lower-cases, dedupes and counts invalid', () => {
    const r = normalizeRecipients([' A@x.com', 'a@X.com', 'bad', 'b@y.io', '', 'c@@z.com']);
    expect(r.valid).toEqual(['a@x.com', 'b@y.io']);
    expect(r.duplicatesRemoved).toBe(1);
    expect(r.invalidCount).toBe(3);
  });
});
