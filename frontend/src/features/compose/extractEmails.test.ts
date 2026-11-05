import { describe, expect, it } from 'vitest';
import { collect, extractEmailsFromText } from './extractEmails';

describe('extractEmailsFromText', () => {
  it('reads emails from any CSV column, ignoring headers and names', () => {
    const csv = 'name,email,company\nAlice,ALICE@Example.com,Acme\nBob,bob@example.org,"Foo, Inc"\n';
    expect(extractEmailsFromText(csv).emails).toEqual(['alice@example.com', 'bob@example.org']);
  });

  it('handles plain text lines, "Name <email>" and mixed separators', () => {
    const txt = 'a@x.io\nCarol <carol@y.com>; d@z.dev  e@w.co\n';
    expect(extractEmailsFromText(txt).emails).toEqual(['a@x.io', 'carol@y.com', 'd@z.dev', 'e@w.co']);
  });

  it('dedupes case-insensitively and counts duplicates and invalid tokens', () => {
    const r = extractEmailsFromText('a@x.io\nA@X.io\nbad@\nfoo@bar\nok@good.com');
    expect(r.emails).toEqual(['a@x.io', 'ok@good.com']);
    expect(r.duplicates).toBe(1);
    expect(r.invalid).toEqual(['foo@bar']);
  });

  it('treats addresses already in the list as duplicates', () => {
    const r = extractEmailsFromText('a@x.io,b@x.io', ['a@x.io']);
    expect(r.emails).toEqual(['b@x.io']);
    expect(r.duplicates).toBe(1);
  });
});

describe('collect', () => {
  it('strips mailto: and trailing dots', () => {
    expect(collect(['mailto:Z@q.com', 'y@q.com.']).emails).toEqual(['z@q.com', 'y@q.com']);
  });
});
