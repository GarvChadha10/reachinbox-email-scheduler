import { describe, expect, it } from 'vitest';
import { ALLOWED_TRANSITIONS, canTransition, type EmailStatus } from '../../src/worker/emailState.js';

describe('email state machine', () => {
  it('allows the happy path', () => {
    expect(canTransition('scheduled', 'sending')).toBe(true);
    expect(canTransition('sending', 'sent')).toBe(true);
    expect(canTransition('sending', 'failed')).toBe(true);
  });
  it('only allows sending -> scheduled for retry, never sent -> anything', () => {
    expect(canTransition('sending', 'scheduled')).toBe(true);
    for (const terminal of ['sent', 'failed', 'cancelled'] as EmailStatus[]) {
      expect(ALLOWED_TRANSITIONS[terminal]).toHaveLength(0);
    }
  });
  it('forbids skipping the claim', () => {
    expect(canTransition('scheduled', 'sent')).toBe(false);
  });
});
