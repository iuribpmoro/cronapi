import cron from 'node-cron';
import { db } from './db/client';

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000];

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
    }>(
      `SELECT id, endpoint_url, http_method, headers, body, cron_expression, notify_url, max_retries
       FROM jobs WHERE enabled = true AND next_run_at <= $1`,
      [now]
    );

    for (const job of due.rows) {
      executeJob(job).catch(() => {});
    }
  });
}

async function attemptRequest(
  endpointUrl: string,
  httpMethod: string,
  headers: Record<string, string>,
  body: string | null
): Promise<{ status: 'success' | 'failed' | 'timeout'; responseStatus: number | null; responseBody: string | null; errorMessage: string | null }> {
  const timeout = 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(endpointUrl, {
      method: httpMethod,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ?? undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const responseBody = (await res.text()).slice(0, 1000);
    const status = res.ok ? 'success' : 'failed';
    return { status, responseStatus: res.status, responseBody, errorMessage: null };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { status: 'timeout', responseStatus: null, responseBody: null, errorMessage: 'Request timed out after 30s' };
    }
    return { status: 'failed', responseStatus: null, responseBody: null, errorMessage: err.message?.slice(0, 500) ?? 'Unknown error' };
  }
}

async function executeJob(job: {
  id: string;
  endpoint_url: string;
  http_method: string;
  headers: Record<string, string>;
  body: string | null;
  cron_expression: string;
  notify_url: string | null;
  max_retries: number;
}) {
  const startedAt = new Date();
  const maxRetries = job.max_retries ?? 3;

  let lastResult = await attemptRequest(job.endpoint_url, job.http_method, job.headers, job.body);
  let retryCount = 0;

  // Retry on failure or timeout with exponential backoff
  while (lastResult.status !== 'success' && retryCount < maxRetries) {
    const delayMs = RETRY_DELAYS_MS[retryCount] ?? 30_000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    retryCount++;
    lastResult = await attemptRequest(job.endpoint_url, job.http_method, job.headers, job.body);
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
    `INSERT INTO job_executions (job_id, status, response_status, response_body, duration_ms, error_message, retry_count, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [job.id, lastResult.status, lastResult.responseStatus, lastResult.responseBody, durationMs, lastResult.errorMessage, retryCount, startedAt, finishedAt]
  );

  await db.query(
    `UPDATE jobs SET last_run_at = $1, next_run_at = $2, updated_at = NOW() WHERE id = $3`,
    [finishedAt, nextRun, job.id]
  );

  // Send failure notification if all retries exhausted
  if (lastResult.status !== 'success' && job.notify_url) {
    sendFailureNotification(job.notify_url, job.id, lastResult.errorMessage ?? `HTTP ${lastResult.responseStatus}`).catch(() => {});
  }
}

async function sendFailureNotification(notifyUrl: string, jobId: string, errorMessage: string): Promise<void> {
  try {
    await fetch(notifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'job_failed', jobId, error: errorMessage, failedAt: new Date().toISOString() }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    // Best-effort — ignore notification errors
  }
}
