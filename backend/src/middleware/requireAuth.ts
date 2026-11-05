import type { RequestHandler } from 'express';
import { SESSION_COOKIE, verifySession } from '../modules/auth/session.js';
import { unauthorized } from '../lib/errors.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[SESSION_COOKIE];
  const claims = typeof token === 'string' ? verifySession(token) : null;
  if (!claims) return next(unauthorized());
  req.user = { id: claims.sub, email: claims.email };
  next();
};

/** For handlers mounted behind requireAuth. */
export function userId(req: { user?: { id: string } }): string {
  if (!req.user) throw unauthorized();
  return req.user.id;
}
