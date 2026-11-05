import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { decrypt, encrypt } from '../../src/lib/crypto.js';

const key = randomBytes(32).toString('hex');

describe('AES-256-GCM helpers', () => {
  it('round-trips', () => {
    const url = 'https://hooks.slack.com/services/T000/B000/XXXX';
    expect(decrypt(encrypt(url, key), key)).toBe(url);
  });
  it('uses a random IV (ciphertexts differ)', () => {
    expect(encrypt('same', key)).not.toBe(encrypt('same', key));
  });
  it('detects tampering', () => {
    const buf = Buffer.from(encrypt('secret', key), 'base64');
    buf[buf.length - 1] ^= 0xff;
    expect(() => decrypt(buf.toString('base64'), key)).toThrow();
  });
  it('fails with the wrong key', () => {
    expect(() => decrypt(encrypt('secret', key), randomBytes(32).toString('hex'))).toThrow();
  });
});
