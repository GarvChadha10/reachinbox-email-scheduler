import { randomBytes, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env, isProd } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { logger } from '../../lib/logger.js';
import { requireAuth, userId } from '../../middleware/requireAuth.js';
import { unauthorized } from '../../lib/errors.js';
import { completeGoogleLogin, googleAuthUrl } from './auth.service.js';
import { SESSION_COOKIE, sessionCookieOptions, signSession } from './session.js';

const STATE_COOKIE = 'oauth_state';
const authLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 50, standardHeaders: 'draft-8', legacyHeaders: false });

export const authRouter = Router();

authRouter.get('/google', authLimiter, (_req, res) => {
  const state = randomBytes(24).toString('hex');
  const url = googleAuthUrl(state); // throws NOT_CONFIGURED clearly if env vars are missing
  res.cookie(STATE_COOKIE, state, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 10 * 60_000, path: '/api/auth' });
  res.redirect(url);
});

authRouter.get('/google/callback', authLimiter, async (req, res) => {
  const fail = (reason: string) => res.redirect(`${env.FRONTEND_URL}/login?error=${encodeURIComponent(reason)}`);
  const { code, state, error } = req.query;
  const expected: unknown = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { path: '/api/auth' });

  if (typeof error === 'string') return fail(error);
  if (typeof code !== 'string' || typeof state !== 'string' || typeof expected !== 'string') return fail('invalid_request');
  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return fail('state_mismatch');

  try {
    const user = await completeGoogleLogin(code);
    res.cookie(SESSION_COOKIE, signSession(user), sessionCookieOptions);
    res.redirect(`${env.FRONTEND_URL}/dashboard`);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'google login failed');
    fail('login_failed');
  }
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: userId(req) } });
  if (!user) throw unauthorized('User no longer exists');
  res.json({ id: user.id, name: user.name, email: user.email, avatarUrl: user.avatarUrl });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, { ...sessionCookieOptions, maxAge: undefined });
  res.status(204).end();
});
