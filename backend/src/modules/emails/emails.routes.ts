import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '../../lib/pagination.js';
import { userId } from '../../middleware/requireAuth.js';
import { getEmail, listScheduled, listSent } from './emails.service.js';
import { searchEmails, STATUS_GROUPS } from '../search/search.service.js';

export const emailsRouter = Router();

const scheduledQuery = paginationSchema.extend({ status: z.enum(['scheduled', 'sending']).optional() });
const sentQuery = paginationSchema.extend({ status: z.enum(['sent', 'failed']).optional() });

emailsRouter.get('/scheduled', async (req, res) => {
  const q = scheduledQuery.parse(req.query);
  res.json(await listScheduled(userId(req), q, q.status));
});

emailsRouter.get('/sent', async (req, res) => {
  const q = sentQuery.parse(req.query);
  res.json(await listSent(userId(req), q, q.status));
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

// Registered last so '/scheduled', '/sent' and '/search' take precedence.
emailsRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  res.json(await getEmail(userId(req), id));
});
