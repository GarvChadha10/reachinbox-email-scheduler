import { OAuth2Client } from 'google-auth-library';
import { env } from '../../config/env.js';
import { AppError, notConfigured, unauthorized } from '../../lib/errors.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../../lib/password.js';
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
  const bySub = await prisma.user.findUnique({ where: { googleSub: p.sub } });
  if (bySub) return prisma.user.update({ where: { id: bySub.id }, data });
  // Same (Google-verified) email already registered with a password: link the Google identity to it.
  const byEmail = await prisma.user.findUnique({ where: { email: data.email } });
  if (byEmail) return prisma.user.update({ where: { id: byEmail.id }, data: { googleSub: p.sub, name: byEmail.name, avatarUrl: data.avatarUrl } });
  return prisma.user.create({ data: { googleSub: p.sub, ...data } });
}

/** Email + password sign-up. Anyone with the link can create an account. */
export async function registerWithPassword(input: { name: string; email: string; password: string }) {
  const email = input.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new AppError(
      409,
      'EMAIL_TAKEN',
      existing.passwordHash ? 'An account with this email already exists. Log in instead.' : 'This email signs in with Google. Use "Login with Google".',
    );
  }
  return prisma.user.create({ data: { email, name: input.name.trim(), passwordHash: await hashPassword(input.password) } });
}

export async function loginWithPassword(input: { email: string; password: string }) {
  const user = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  // Always run one hash comparison so response time doesn't reveal whether the email exists.
  const ok = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !user.passwordHash || !ok) throw unauthorized('Invalid email or password');
  return user;
}
