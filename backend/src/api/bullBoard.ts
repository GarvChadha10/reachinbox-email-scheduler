import type { Express } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { env, isProd } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { basicAuth } from '../middleware/basicAuth.js';
import { emailsQueue, indexingQueue, maintenanceQueue } from '../queue/queues.js';

export const BULL_BOARD_PATH = '/admin/queues';

export function mountBullBoard(app: Express): void {
  if (!env.BULL_BOARD_USER || !env.BULL_BOARD_PASSWORD) {
    if (isProd) {
      logger.error('BULL_BOARD_USER/BULL_BOARD_PASSWORD not set: Bull Board is disabled');
      return;
    }
    logger.warn('BULL_BOARD_USER/BULL_BOARD_PASSWORD not set: Bull Board is disabled');
    return;
  }
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_PATH);
  createBullBoard({
    queues: [new BullMQAdapter(emailsQueue), new BullMQAdapter(indexingQueue), new BullMQAdapter(maintenanceQueue)],
    serverAdapter,
    options: { uiConfig: { boardTitle: 'Email Scheduler' } },
  });
  app.use(BULL_BOARD_PATH, basicAuth(env.BULL_BOARD_USER, env.BULL_BOARD_PASSWORD), serverAdapter.getRouter());
}
