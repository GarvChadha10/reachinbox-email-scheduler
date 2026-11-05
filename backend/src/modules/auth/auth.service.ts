import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { notConfigured, unauthorized } from '../../lib/errors.js';
import { prisma } from '../../db/prisma.js';

function client(): OAuth2Client {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw notConfigured('Google OAuth (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  return new OAuth2Client({
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI,
  });
}

export function googleAuthUrl(state: string): string {
  return client().generateAuthUrl({
    access_type: 'online',
    scope: ['openid', 'email', 'profile'],
    state,
    prompt: 'select_account',
  });
}

/** Exchange the code, verify the ID token (signature + audience), and upsert the user. */
export async function completeGoogleLogin(code: string) {
  const c = client();
  const { tokens } = await c.getToken(code);
  if (!tokens.id_token) throw unauthorized('Google did not return an ID token');
  const ticket = await c.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID! });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw unauthorized('Google ID token is missing required claims');
  if (p.email_verified === false) throw unauthorized('Google email is not verified');

  const data = { email: p.email.toLowerCase(), name: p.name ?? p.email, avatarUrl: p.picture ?? null };
  return prisma.user.upsert({ where: { googleSub: p.sub }, create: { googleSub: p.sub, ...data }, update: data });
}
