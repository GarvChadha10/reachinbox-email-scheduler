import { Router } from 'express';
import { listActiveSenders } from './senders.service.js';

export const sendersRouter = Router();

/** The shared sender pool (never exposes SMTP credentials). */
sendersRouter.get('/', async (_req, res) => {
  const senders = await listActiveSenders();
  res.json(senders.map((s) => ({ id: s.id, email: s.email, displayName: s.displayName })));
});
