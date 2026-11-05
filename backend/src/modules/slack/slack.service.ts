import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { env } from '../../config/env.js';
import { prisma } from '../../db/prisma.js';
import { redis } from '../../queue/connection.js';
import { decrypt, encrypt } from '../../lib/crypto.js';
import { badRequest, notConfigured } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

const STATE_TTL_S = 600;
const stateKey = (s: string) => `slack:state:${s}`;

function slackConfig() {
  if (!env.SLACK_CLIENT_ID || !env.SLACK_CLIENT_SECRET) throw notConfigured('Slack OAuth (SLACK_CLIENT_ID / SLACK_CLIENT_SECRET)');
  if (!env.PUBLIC_BACKEND_URL?.startsWith('https://')) {
    throw notConfigured('PUBLIC_BACKEND_URL (an https tunnel to the backend; Slack requires https redirect URLs)');
  }
  return {
    clientId: env.SLACK_CLIENT_ID,
    clientSecret: env.SLACK_CLIENT_SECRET,
    redirectUri: `${env.PUBLIC_BACKEND_URL.replace(/\/$/, '')}/api/slack/callback`,
  };
}

export async function slackAuthorizeUrl(userId: string): Promise<string> {
  const cfg = slackConfig();
  const state = randomBytes(24).toString('hex');
  await redis.set(stateKey(state), userId, 'EX', STATE_TTL_S);
  const u = new URL('https://slack.com/oauth/v2/authorize');
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('scope', 'incoming-webhook');
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('state', state);
  return u.toString();
}

/** One-time state: GETDEL so a nonce can never be replayed. */
export async function consumeState(state: string): Promise<string | null> {
  return redis.getdel(stateKey(state));
}

interface OAuthAccessResponse {
  ok: boolean;
  error?: string;
  team?: { name?: string };
  incoming_webhook?: { url: string; channel?: string };
}

export async function completeSlackOAuth(userId: string, code: string): Promise<void> {
  const cfg = slackConfig();
  const res = await fetch('https://slack.com/api/oauth.v2.access', {
    method: 'POST',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({ code, redirect_uri: cfg.redirectUri }),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json()) as OAuthAccessResponse;
  if (!data.ok || !data.incoming_webhook?.url) throw badRequest(`Slack OAuth failed: ${data.error ?? 'no incoming_webhook in response'}`);

  const row = {
    webhookUrlEnc: encrypt(data.incoming_webhook.url, env.ENCRYPTION_KEY),
    teamName: data.team?.name ?? null,
    channelName: data.incoming_webhook.channel ?? null,
  };
  await prisma.slackConnection.upsert({ where: { userId }, create: { userId, ...row }, update: row });
  logger.info({ userId, team: row.teamName, channel: row.channelName }, 'slack connected');
}

export async function slackStatus(userId: string) {
  const c = await prisma.slackConnection.findUnique({ where: { userId } });
  return { connected: !!c, teamName: c?.teamName ?? null, channelName: c?.channelName ?? null };
}

export async function disconnectSlack(userId: string): Promise<void> {
  await prisma.slackConnection.deleteMany({ where: { userId } });
}

const REVOKED_MARKERS = ['no_service', 'channel_is_archived', 'invalid_token', 'token_revoked', 'no_team', 'team_disabled', 'action_prohibited'];

export interface PostResult {
  status: string;
  response: string;
}

/**
 * Post to the user's webhook. Looks the connection up *now* (no cache), so connecting Slack later
 * takes effect immediately. Never throws. Deletes the connection if Slack says it is gone.
 */
export async function postToUserSlack(userId: string, text: string): Promise<PostResult | null> {
  const conn = await prisma.slackConnection.findUnique({ where: { userId } });
  if (!conn) return null;
  try {
    const url = decrypt(conn.webhookUrlEnc, env.ENCRYPTION_KEY);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(5_000),
    });
    const body = (await res.text()).slice(0, 500);
    if (res.status === 404 || res.status === 410 || REVOKED_MARKERS.some((m) => body.includes(m))) {
      await prisma.slackConnection.deleteMany({ where: { userId } });
      logger.warn({ userId, httpStatus: res.status, body }, 'slack webhook revoked; connection removed');
    }
    return { status: String(res.status), response: body };
  } catch (err) {
    logger.warn({ userId, err: (err as Error).message }, 'slack post failed');
    return { status: 'error', response: (err as Error).message.slice(0, 500) };
  }
}

export interface RateLimitNotice {
  userId: string;
  senderId: string;
  senderEmail: string;
  cap: number;
  scope: 'sender' | 'campaign';
  windowEndMs: number;
}

function fmt(ms: number, tz: string) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }).format(ms);
}

/**
 * Notify once per (user, sender, hour window). notification_log's unique key is the dedupe:
 * we only post if our insert won. If the user has no Slack connection we skip without inserting,
 * so a connection made later in the same window can still notify.
 */
export async function notifyRateLimitHit(n: RateLimitNotice): Promise<void> {
  try {
    const hasConn = await prisma.slackConnection.count({ where: { userId: n.userId } });
    if (!hasConn) return;

    const windowStart = new Date(n.windowEndMs - 3_600_000);
    const inserted = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO notification_log (id, user_id, sender_id, window_start, kind, status)
      VALUES (gen_random_uuid(), ${n.userId}::uuid, ${n.senderId}::uuid, ${windowStart}, 'rate_limit', 'pending')
      ON CONFLICT (user_id, sender_id, window_start, kind) DO NOTHING
      RETURNING id`);
    const logId = inserted[0]?.id;
    if (!logId) return;

    const deferred = await prisma.email.count({
      where: { userId: n.userId, senderId: n.senderId, status: 'scheduled', deferredCount: { gt: 0 } },
    });
    const text = [
      `:warning: *Hourly sending limit reached* for sender \`${n.senderEmail}\``,
      `• Limit: *${n.cap} emails/hour* (${n.scope === 'sender' ? 'global per-sender cap' : 'campaign hourly limit'})`,
      `• Remaining emails are deferred, not dropped. Sending resumes at *${fmt(n.windowEndMs, 'Asia/Kolkata')} IST* (${fmt(n.windowEndMs, 'UTC')} UTC)`,
      `• Emails deferred so far: *${deferred}*`,
    ].join('\n');

    const result = await postToUserSlack(n.userId, text);
    await prisma.notificationLog.update({
      where: { id: logId },
      data: { status: result?.status ?? 'no_connection', response: result?.response ?? null },
    });
  } catch (err) {
    logger.warn({ err: (err as Error).message, userId: n.userId }, 'rate-limit notification failed');
  }
}
