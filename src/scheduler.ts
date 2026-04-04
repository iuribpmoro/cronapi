import cron from 'node-cron';
import { db } from './db/client';
import { runJob } from './lib/executeJob';
import { logger } from './lib/logger';

export function startScheduler() {
  // Every minute: find enabled jobs due to run and execute them
  cron.schedule('* * * * *', async () => {
    const now = new Date();
    const due = await db.query<{
      id: string;
      endpoint_url: string;
      http_method: string;
      headers: Record<string, string>;
      body: string | null;
      cron_expression: string;
      notify_url: string | null;
      max_retries: number;
      signing_secret: string;
      timeout_ms: number;
    }>(
      `SELECT id, endpoint_url, http_method, headers, body, cron_expression, notify_url, max_retries, signing_secret, timeout_ms
       FROM jobs WHERE enabled = true AND next_run_at <= $1`,
      [now]
    );

    for (const job of due.rows) {
      executeScheduledJob(job).catch(() => {});
    }
  });

  // Daily at 02:00 UTC: database snapshot summary (logical backup indicator)
  // Note: Render free-tier Postgres does not include pg_dump from the app container.
  // This cron logs a structured row-count snapshot so data loss is detectable.
  // For automated backups, configure Render managed backups (paid) or set
  // DATABASE_BACKUP_URL for a custom pg_dump export job.
  cron.schedule('0 2 * * *', async () => {
    try {
      const [users, jobs, executions] = await Promise.all([
        db.query<{ count: string }>('SELECT COUNT(*) as count FROM users WHERE deleted_at IS NULL'),
        db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs'),
        db.query<{ count: string }>('SELECT COUNT(*) as count FROM job_executions'),
      ]);
      logger.info('daily_backup_snapshot', {
        activeUsers: parseInt(users.rows[0].count, 10),
        totalJobs: parseInt(jobs.rows[0].count, 10),
        totalExecutions: parseInt(executions.rows[0].count, 10),
      });
    } catch (e: any) {
      logger.error('daily_backup_snapshot_failed', { error: e.message });
    }
  });

  // Every 5 minutes: self-health check (dogfooding our own /health endpoint)
  cron.schedule('*/5 * * * *', async () => {
    const port = process.env.PORT ?? '3000';
    try {
      const res = await fetch(`http://localhost:${port}/health`, { signal: AbortSignal.timeout(5_000) });
      const body = await res.json() as Record<string, unknown>;
      if (body.status === 'ok') {
        logger.info('health_check_ok', { uptime: body.uptime, database: body.database });
      } else {
        logger.warn('health_check_degraded', { status: body.status, database: body.database });
      }
    } catch (err: any) {
      logger.error('health_check_failed', { error: err.message });
    }

    // Keep-alive: ping the external URL to prevent Render free-tier spin-down.
    // Set KEEP_ALIVE_URL=https://cronapi.hakinsight.com/health in Render env vars.
    const keepAliveUrl = process.env.KEEP_ALIVE_URL;
    if (keepAliveUrl) {
      try {
        await fetch(keepAliveUrl, { method: 'GET', signal: AbortSignal.timeout(10_000) });
        logger.info('keep_alive_ping_ok', { url: keepAliveUrl });
      } catch (err: any) {
        logger.warn('keep_alive_ping_failed', { url: keepAliveUrl, error: err.message });
      }
    }
  });
}

async function executeScheduledJob(job: {
  id: string;
  endpoint_url: string;
  http_method: string;
  headers: Record<string, string>;
  body: string | null;
  cron_expression: string;
  notify_url: string | null;
  max_retries: number;
  signing_secret: string;
  timeout_ms: number;
}) {
  const result = await runJob(job);

  if (result.status !== 'success') {
    logger.error('job_execution_failed', {
      jobId: job.id,
      status: result.status,
      retryCount: result.retryCount,
      durationMs: result.durationMs,
      responseStatus: result.responseStatus,
      error: result.errorMessage,
    });
  }

  // Compute next run and update job
  let nextRun: Date | null = null;
  try {
    const { parseExpression } = await import('cron-parser');
    nextRun = parseExpression(job.cron_expression, { currentDate: result.finishedAt }).next().toDate();
  } catch {}

  await db.query(
    `UPDATE jobs SET last_run_at = $1, next_run_at = $2, updated_at = NOW() WHERE id = $3`,
    [result.finishedAt, nextRun, job.id]
  );
}
