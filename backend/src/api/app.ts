import { randomUUID } from 'node:crypto';
import express, { Router } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';
import { authRouter } from '../modules/auth/auth.routes.js';
import { campaignsRouter } from '../modules/campaigns/campaigns.routes.js';
import { emailsRouter } from '../modules/emails/emails.routes.js';
import { slackRouter } from '../modules/slack/slack.routes.js';
import { sendersRouter } from '../modules/senders/senders.routes.js';
import { healthRouter } from './health.js';
import { mountBullBoard } from './bullBoard.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const id = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
        res.setHeader('x-request-id', id);
        return id;
      },
      // Never log query strings: OAuth callbacks carry codes and state there.
      serializers: { req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, path: req.url.split('?')[0] }) },
      autoLogging: { ignore: (req) => req.url === '/health' },
    }),
  );
  // Bull Board's UI needs inline scripts/styles; give it its own relaxed CSP before helmet.
  mountBullBoard(app);
  app.use(helmet());
  app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.use('/health', healthRouter);

  const api = Router();
  api.use('/auth', authRouter);
  api.use('/slack', slackRouter); // per-route auth (the callback arrives without a session cookie)
  api.use('/campaigns', requireAuth, campaignsRouter);
  api.use('/emails', requireAuth, emailsRouter);
  api.use('/senders', requireAuth, sendersRouter);
  api.use('/health', healthRouter);
  app.use('/api', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
