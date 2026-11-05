import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination.js';
import { userId } from '../../middleware/requireAuth.js';
import { listScheduled, listSent } from './emails.service.js';
import { searchEmails, STATUS_GROUPS } from '../search/search.service.js';

export const emailsRouter = Router();

emailsRouter.get('/scheduled', async (req, res) => {
  res.json(await listScheduled(userId(req), paginationSchema.parse(req.query)));
});

emailsRouter.get('/sent', async (req, res) => {
  res.json(await listSent(userId(req), paginationSchema.parse(req.query)));
});

const searchSchema = paginationSchema.extend({
  q: z.string().trim().max(200).default(''),
  // Either a tab group ("scheduled" / "sent") or a single concrete status.
  status: z.enum(['scheduled', 'sent', 'sending', 'failed', 'cancelled']).optional(),
});

emailsRouter.get('/search', async (req, res) => {
  const p = searchSchema.parse(req.query);
  const status =
    p.status === 'scheduled' || p.status === 'sent' ? [...STATUS_GROUPS[p.status]] : p.status ? [p.status] : undefined;
  res.json(await searchEmails(userId(req), { ...p, status }));
});
