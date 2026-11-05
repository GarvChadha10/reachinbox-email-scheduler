import type { Express, RequestHandler } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env } from '../config/env.js';
import { basicAuth } from '../middleware/basicAuth.js';
import { SESSION_COOKIE, verifySession } from '../modules/auth/session.js';
import { emailsQueue, indexingQueue, maintenanceQueue } from '../queue/queues.js';

export const BULL_BOARD_PATH = '/admin/queues';

/**
 * Who may open the queue dashboard:
 *  - any signed-in user of the app (session cookie), so reviewers need no extra password;
 *  - or HTTP Basic auth with BULL_BOARD_USER/BULL_BOARD_PASSWORD, if set (for curl / ops).
 * Anyone else is sent to the login page (browsers) or gets a 401 (API calls).
 */
const boardAccess: RequestHandler = (req, res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  if (typeof token === 'string' && verifySession(token)) return next();
  if (env.BULL_BOARD_USER && env.BULL_BOARD_PASSWORD && req.headers.authorization?.startsWith('Basic ')) {
    return basicAuth(env.BULL_BOARD_USER, env.BULL_BOARD_PASSWORD)(req, res, next);
  }
  if (req.method === 'GET' && req.accepts('html') && !req.path.startsWith('/api')) {
    return res.redirect(`${env.FRONTEND_URL}/login`);
  }
  res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Sign in to view the queue dashboard' } });
};

export function mountBullBoard(app: Express): void {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  // Read-only: viewers can inspect delayed/active/completed/failed jobs but cannot retry, promote,
  // clean or delete them. Jobs carry only { emailId }, never addresses or content.
  const readOnly = { readOnlyMode: true };
  createBullBoard({
    queues: [
      new BullMQAdapter(emailsQueue, readOnly),
      new BullMQAdapter(indexingQueue, readOnly),
      new BullMQAdapter(maintenanceQueue, readOnly),
    ],
    serverAdapter,
    options: { uiConfig: { boardTitle: 'Email Scheduler' } },
  });
  app.use(BULL_BOARD_PATH, boardAccess, serverAdapter.getRouter());
}
