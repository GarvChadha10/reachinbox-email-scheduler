import pino from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.LOG_LEVEL,
  // Defence in depth: never print secrets even if someone logs a whole object.
  redact: {
    paths: [
      'smtpPass',
      '*.smtpPass',
      'webhookUrl',
      '*.webhookUrl',
      'webhookUrlEnc',
      '*.webhookUrlEnc',
      'req.headers.cookie',
      'req.headers.authorization',
      'res.headers["set-cookie"]',
    ],
    censor: '[redacted]',
  },
  transport: isProd ? undefined : { target: 'pino-pretty', options: { translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' } },
});
