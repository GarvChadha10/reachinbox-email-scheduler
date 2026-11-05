/** Helpers shared by the verification scripts (local dev only; never used by the server). */
import { prisma } from '../src/db/prisma.js';
import { signSession } from '../src/modules/auth/session.js';

export const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4000}`;

export const DEMO_USER = { googleSub: 'local-demo-user', email: 'demo@example.com', name: 'Demo User' };

export async function ensureDemoUser() {
  return prisma.user.upsert({ where: { googleSub: DEMO_USER.googleSub }, create: DEMO_USER, update: {} });
}

/** A session cookie for the demo user, signed with the local JWT_SECRET (same as the real login). */
export async function demoCookie(): Promise<string> {
  const u = await ensureDemoUser();
  return `session=${signSession(u)}`;
}

export async function api<T>(path: string, init: RequestInit & { cookie: string }): Promise<{ status: number; body: T }> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', cookie: init.cookie, ...(init.headers ?? {}) },
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`PASS: ${msg}`);
}
