import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';
import type SMTPPool from 'nodemailer/lib/smtp-pool/index.js';

export interface SmtpSender {
  id: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
}

type PooledTransport = Transporter<SMTPPool.SentMessageInfo>;
const transports = new Map<string, PooledTransport>();

/** One pooled SMTP transport per sender, created lazily and cached for the process lifetime. */
export function getTransport(sender: SmtpSender): PooledTransport {
  let t = transports.get(sender.id);
  if (!t && env.MAIL_DRY_RUN) {
    // Same code path, no network: used by scripts/load-test.ts.
    t = nodemailer.createTransport({ jsonTransport: true }) as unknown as PooledTransport;
    transports.set(sender.id, t);
  }
  if (!t) {
    const created: PooledTransport = nodemailer.createTransport({
      pool: true,
      maxConnections: 2,
      host: sender.smtpHost,
      port: sender.smtpPort,
      secure: sender.smtpPort === 465,
      auth: { user: sender.smtpUser, pass: sender.smtpPass },
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 30_000,
    });
    transports.set(sender.id, created);
    t = created;
  }
  return t;
}

export function closeTransports(): void {
  for (const t of transports.values()) t.close();
  transports.clear();
}
