import { describe, expect, it } from 'vitest';
import { classifySmtpError } from '../../src/mail/classifyError.js';

describe('classifySmtpError', () => {
  it.each([
    [{ responseCode: 550, command: 'RCPT TO' }, 'permanent'],
    [{ responseCode: 554, command: 'DATA' }, 'permanent'],
    [{ code: 'EENVELOPE' }, 'permanent'],
    [{ responseCode: 421, command: 'MAIL FROM' }, 'transient'],
    [{ responseCode: 451, command: 'DATA' }, 'transient'],
    [{ code: 'ECONNECTION', command: 'CONN' }, 'transient'],
    [{ code: 'ETIMEDOUT', command: 'CONN' }, 'transient'],
    [{ code: 'EDNS' }, 'transient'],
    [{ code: 'ESOCKET', command: 'AUTH PLAIN' }, 'transient'],
    [{ code: 'ETIMEDOUT', command: 'DATA' }, 'ambiguous'],
    [{ code: 'ESOCKET' }, 'ambiguous'],
    [{ message: 'something odd' }, 'ambiguous'],
  ] as const)('%j -> %s', (err, expected) => {
    expect(classifySmtpError(err)).toBe(expected);
  });
});
