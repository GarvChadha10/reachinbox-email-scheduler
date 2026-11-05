// Unit tests import modules that read env at load time; give them harmless values.
process.env.DATABASE_URL ??= 'postgresql://scheduler:scheduler@localhost:55432/scheduler';
process.env.REDIS_URL ??= 'redis://localhost:56379';
process.env.ELASTICSEARCH_URL ??= 'http://localhost:9200';
process.env.JWT_SECRET ??= 'test-secret-test-secret';
process.env.ENCRYPTION_KEY ??= '0'.repeat(64);
process.env.LOG_LEVEL ??= 'silent';
