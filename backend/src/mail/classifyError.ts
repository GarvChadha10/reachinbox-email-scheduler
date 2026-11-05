/**
 * Classify a Nodemailer send error for the at-most-once policy.
 *  - permanent:  the server definitively rejected the message (5xx, bad envelope). Do not retry.
 *  - transient:  failed before the message body was handed over (connect/DNS/handshake/auth stage,
 *                or a 4xx rejection). Definitely not delivered, so it is safe to retry.
 *  - ambiguous:  failed while/after transmitting DATA (socket drop, timeout). It may have been
 *                delivered, so we never retry (at-most-once).
 */
export type SmtpErrorClass = 'permanent' | 'transient' | 'ambiguous';

export interface SmtpLikeError {
  code?: string;
  responseCode?: number;
  command?: string;
  message?: string;
}

const PRE_DATA_COMMANDS = /^(CONN|EHLO|HELO|LHLO|STARTTLS|AUTH|MAIL FROM|RCPT TO)/i;
const NETWORK_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ETLS', 'ECONNREFUSED', 'ECONNRESET', 'EPROTOCOL']);

export function classifySmtpError(err: SmtpLikeError): SmtpErrorClass {
  const rc = err.responseCode;
  if (typeof rc === 'number') {
    if (rc >= 500) return 'permanent';
    if (rc >= 400) return 'transient';
  }
  if (err.code === 'EENVELOPE' || err.code === 'EMESSAGE') return 'permanent';
  if (err.code === 'EDNS') return 'transient';
  if (err.code && NETWORK_CODES.has(err.code)) {
    // Only safe to retry if we know the failure happened before DATA.
    return err.command && PRE_DATA_COMMANDS.test(err.command) ? 'transient' : 'ambiguous';
  }
  return 'ambiguous';
}
