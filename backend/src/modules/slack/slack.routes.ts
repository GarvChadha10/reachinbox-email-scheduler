import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';
import { badRequest } from '../../lib/errors.js';
import { requireAuth, userId } from '../../middleware/requireAuth.js';
import { completeSlackOAuth, consumeState, disconnectSlack, postToUserSlack, slackAuthorizeUrl, slackStatus } from './slack.service.js';

const limiter = rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false });
export const slackRouter = Router();

slackRouter.get('/connect', limiter, requireAuth, async (req, res) => {
  res.redirect(await slackAuthorizeUrl(userId(req)));
});

/**
 * Arrives on the https tunnel domain, so the localhost session cookie is NOT present.
 * The one-time state nonce (stored in Redis) identifies the user.
 */
slackRouter.get('/callback', limiter, async (req, res) => {
  const done = (result: 'connected' | 'error' | 'denied') => res.redirect(`${env.FRONTEND_URL}/dashboard?slack=${result}`);
  const { code, state, error } = req.query;
  const uid = typeof state === 'string' ? await consumeState(state) : null;
  if (error === 'access_denied') return done('denied');
  if (typeof code !== 'string' || !uid) return done('error');
  try {
    await completeSlackOAuth(uid, code);
    done('connected');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'slack oauth callback failed');
    done('error');
  }
});

slackRouter.get('/status', requireAuth, async (req, res) => {
  res.json(await slackStatus(userId(req)));
});

slackRouter.delete('/disconnect', requireAuth, async (req, res) => {
  await disconnectSlack(userId(req));
  res.status(204).end();
});

slackRouter.post('/test', limiter, requireAuth, async (req, res) => {
  const r = await postToUserSlack(userId(req), ':white_check_mark: Test message from the ReachInbox email scheduler.');
  if (!r) throw badRequest('Slack is not connected');
  res.json({ ok: r.status === '200', status: r.status });
});
