import cron from 'node-cron';
import { db } from './db/client';
import { runJob } from './lib/executeJob';

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
