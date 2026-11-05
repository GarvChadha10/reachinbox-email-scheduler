import type { EmailStatus } from '../../types/api';

export type TabKey = 'scheduled' | 'sent';
export type StatusFilter = '' | 'scheduled' | 'sending' | 'sent' | 'failed';

/** Normalised row shared by the Scheduled list, the Sent list and search results. */
export interface EmailRow {
  id: string;
  recipient: string;
  subject: string;
  bodyPreview: string;
  time: string | null;
  status: EmailStatus;
  senderEmail: string;
  deferredCount: number;
  failureReason: string | null;
  lastError: string | null;
  previewUrl: string | null;
}
