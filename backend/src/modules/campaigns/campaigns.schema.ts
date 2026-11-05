import { z } from 'zod';

export const createCampaignSchema = z.object({
  subject: z.string().trim().min(1).max(200),
  body: z.string().min(1).max(20_000),
  recipients: z.array(z.string().max(320)).min(1).max(50_000),
  startAt: z.iso.datetime({ offset: true }),
  delayMs: z.number().int().min(0).max(86_400_000),
  hourlyLimit: z.number().int().min(1).max(1_000_000),
});
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

export const idempotencyKeySchema = z.string().trim().min(8).max(128);
