import cron from 'node-cron';
import { db } from './db/client';

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
    }>(
      `SELECT id, endpoint_url, http_method, headers, body, cron_expression
       FROM jobs WHERE enabled = true AND next_run_at <= $1`,
      [now]
    );

    for (const job of due.rows) {
      executeJob(job).catch(() => {});
    }
  });
}

async function executeJob(job: {
  id: string;
  endpoint_url: string;
  http_method: string;
  headers: Record<string, string>;
  body: string | null;
  cron_expression: string;
}) {
  const startedAt = new Date();
  const timeout = 30000;

  let status: 'success' | 'failed' | 'timeout' = 'failed';
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const res = await fetch(job.endpoint_url, {
        method: job.http_method,
        headers: { 'Content-Type': 'application/json', ...job.headers },
        body: job.body ?? undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      responseStatus = res.status;
      responseBody = (await res.text()).slice(0, 1000);
      status = res.ok ? 'success' : 'failed';
    } catch (err: any) {
      clearTimeout(timer);
      if (err.name === 'AbortError') {
        status = 'timeout';
        errorMessage = 'Request timed out after 30s';
      } else {
        errorMessage = err.message?.slice(0, 500) ?? 'Unknown error';
      }
    }
  } catch (err: any) {
    errorMessage = err.message?.slice(0, 500) ?? 'Unknown error';
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  // Compute next run
  let nextRun: Date | null = null;
  try {
    const { parseExpression } = await import('cron-parser');
    nextRun = parseExpression(job.cron_expression, { currentDate: finishedAt }).next().toDate();
  } catch {}

  await db.query(
    `INSERT INTO job_executions (job_id, status, response_status, response_body, duration_ms, error_message, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [job.id, status, responseStatus, responseBody, durationMs, errorMessage, startedAt, finishedAt]
  );

  await db.query(
    `UPDATE jobs SET last_run_at = $1, next_run_at = $2, updated_at = NOW() WHERE id = $3`,
    [finishedAt, nextRun, job.id]
  );
}
