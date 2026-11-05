import { Client } from '@elastic/elasticsearch';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export const ES_INDEX = 'emails';

export const es = new Client({ node: env.ELASTICSEARCH_URL, requestTimeout: 10_000, maxRetries: 2 });

export async function ensureEmailIndex(): Promise<void> {
  const exists = await es.indices.exists({ index: ES_INDEX });
  if (exists) return;
  try {
    await es.indices.create({
      index: ES_INDEX,
      mappings: {
        dynamic: 'strict',
        properties: {
          recipient_email: { type: 'search_as_you_type', fields: { keyword: { type: 'keyword' } } },
          subject: { type: 'text' },
          body: { type: 'text' },
          status: { type: 'keyword' },
          user_id: { type: 'keyword' },
          campaign_id: { type: 'keyword' },
          sender_email: { type: 'keyword' },
          failure_reason: { type: 'keyword' },
          preview_url: { type: 'keyword', index: false },
          deferred_count: { type: 'integer' },
          scheduled_at: { type: 'date' },
          processed_at: { type: 'date' },
          updated_at: { type: 'date' },
        },
      },
    });
    logger.info({ index: ES_INDEX }, 'created Elasticsearch index');
  } catch (err) {
    // Another process may have created it concurrently.
    if ((err as { meta?: { body?: { error?: { type?: string } } } }).meta?.body?.error?.type !== 'resource_already_exists_exception') throw err;
  }
}
