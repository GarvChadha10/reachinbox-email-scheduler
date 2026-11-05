import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import { env, isProd } from '../../config/env.js';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_S = 7 * 24 * 3600;

interface SessionClaims {
  sub: string;
  email: string;
}

export function signSession(user: { id: string; email: string }): string {
  return jwt.sign({ email: user.email }, env.JWT_SECRET, { subject: user.id, expiresIn: SESSION_TTL_S, algorithm: 'HS256' });
}

export function verifySession(token: string): SessionClaims | null {
  try {
    const p = jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });
    if (typeof p === 'string' || !p.sub || typeof p.email !== 'string') return null;
    return { sub: p.sub, email: p.email };
  } catch {
    return null;
  }
}

export const sessionCookieOptions: CookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  path: '/',
  maxAge: SESSION_TTL_S * 1000,
};
