import { Router } from 'express';
import { badRequest } from '../../lib/errors.js';
import { userId } from '../../middleware/requireAuth.js';
import { createCampaignSchema, idempotencyKeySchema } from './campaigns.schema.js';
import { createCampaign } from './campaigns.service.js';

export const campaignsRouter = Router();

campaignsRouter.post('/', async (req, res) => {
  const key = idempotencyKeySchema.safeParse(req.header('Idempotency-Key'));
  if (!key.success) throw badRequest('Idempotency-Key header is required (8-128 chars, e.g. a UUID)');
  const input = createCampaignSchema.parse(req.body);
  const result = await createCampaign(userId(req), key.data, input);
  res.status(result.replayed ? 200 : 201).json(result.payload);
});
