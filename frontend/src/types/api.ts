export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ScheduledStatus = 'scheduled' | 'sending';
export type SentStatus = 'sent' | 'failed';
export type EmailStatus = ScheduledStatus | SentStatus | 'cancelled';

export interface ScheduledEmail {
  id: string;
  recipient: string;
  subject: string;
  bodyPreview: string;
  scheduledAt: string;
  status: ScheduledStatus;
  senderEmail: string;
  deferredCount: number;
}

export interface SentEmail {
  id: string;
  recipient: string;
  subject: string;
  bodyPreview: string;
  sentAt: string | null;
  status: SentStatus;
  failureReason: string | null;
  lastError: string | null;
  previewUrl: string | null;
  senderEmail: string;
}

export interface SearchHit {
  id: string;
  recipient: string;
  subject: string;
  bodyPreview: string;
  status: EmailStatus;
  senderEmail: string;
  scheduledAt: string;
  sentAt: string | null;
  failureReason: string | null;
  previewUrl: string | null;
  deferredCount: number;
}

export interface EmailDetail {
  id: string;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  senderEmail: string;
  senderName: string;
  scheduledAt: string;
  sentAt: string | null;
  attemptCount: number;
  deferredCount: number;
  failureReason: string | null;
  lastError: string | null;
  previewUrl: string | null;
  messageId: string | null;
}

export interface Sender {
  id: string;
  email: string;
  displayName: string;
}

export interface CreateCampaignRequest {
  subject: string;
  body: string;
  recipients: string[];
  startAt: string;
  delayMs: number;
  hourlyLimit: number;
  senderId?: string;
}

export interface CreateCampaignResponse {
  campaign: { id: string; subject: string; startAt: string; delayMs: number; hourlyLimit: number; totalCount: number; createdAt: string };
  effective: { delayMs: number; hourlyLimit: number };
  clamped: { delayMs: boolean; hourlyLimit: boolean };
  scheduledCount: number;
  invalidCount: number;
  duplicatesRemoved: number;
  firstScheduledAt: string | null;
  lastScheduledAt: string | null;
}

export interface SlackStatus {
  connected: boolean;
  teamName: string | null;
  channelName: string | null;
}
