import { db } from './client';

async function migrate(): Promise<void> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'indie', 'pro')),
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL,
        key_prefix TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT 'Default',
        active BOOLEAN NOT NULL DEFAULT true,
        last_used_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        endpoint_url TEXT NOT NULL,
        cron_expression TEXT NOT NULL,
        http_method TEXT NOT NULL DEFAULT 'GET' CHECK (http_method IN ('GET','POST','PUT','PATCH','DELETE')),
        headers JSONB NOT NULL DEFAULT '{}',
        body TEXT,
        enabled BOOLEAN NOT NULL DEFAULT true,
        next_run_at TIMESTAMPTZ,
        last_run_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);
      CREATE INDEX IF NOT EXISTS idx_jobs_next_run_at ON jobs(next_run_at) WHERE enabled = true;
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS job_executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('success','failed','timeout')),
        response_status INT,
        response_body TEXT,
        duration_ms INT,
        error_message TEXT,
        retry_count INT NOT NULL DEFAULT 0,
        started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        finished_at TIMESTAMPTZ
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_job_executions_job_id ON job_executions(job_id);
      CREATE INDEX IF NOT EXISTS idx_job_executions_started_at ON job_executions(started_at DESC);
    `);

    // Idempotent additions for post-MVP features
    await client.query(`ALTER TABLE job_executions ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS notify_url TEXT`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS max_retries INT NOT NULL DEFAULT 3`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS signing_secret TEXT NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')`);
    await client.query(`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS timeout_ms INT NOT NULL DEFAULT 30000`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS api_usage (
        key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        request_count INT NOT NULL DEFAULT 0,
        PRIMARY KEY (key_id, date)
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_api_usage_date ON api_usage(date DESC);
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS request_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
        method TEXT NOT NULL,
        endpoint TEXT NOT NULL,
        status_code INT NOT NULL,
        duration_ms INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_request_logs_key_id ON request_logs(key_id);
      CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at DESC);
    `);

    await client.query('COMMIT');
    console.log('Migration complete');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

migrate()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
