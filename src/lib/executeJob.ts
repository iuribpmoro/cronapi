import { createHmac } from 'crypto';
import { db } from '../db/client';

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000];

function signPayload(signingSecret: string, body: string): string {
  return 'sha256=' + createHmac('sha256', signingSecret).update(body).digest('hex');
}

export interface JobExecutionResult {
  id: string;
  jobId: string;
  status: 'success' | 'failed' | 'timeout';
  responseStatus: number | null;
  responseBody: string | null;
  durationMs: number;
  errorMessage: string | null;
  retryCount: number;
  startedAt: Date;
  finishedAt: Date;
}

interface AttemptResult {
  status: 'success' | 'failed' | 'timeout';
  responseStatus: number | null;
  responseBody: string | null;
  errorMessage: string | null;
}

interface AttemptRecord extends AttemptResult {
  attemptNumber: number;
  durationMs: number;
  attemptedAt: Date;
}

async function attemptRequest(
  endpointUrl: string,
  httpMethod: string,
  headers: Record<string, string>,
  body: string | null,
  timeoutMs: number,
  signingSecret: string
): Promise<AttemptResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const payload = body ?? '';
  const signature = signPayload(signingSecret, payload);

  try {
    const res = await fetch(endpointUrl, {
      method: httpMethod,
      headers: { 'Content-Type': 'application/json', 'X-CronAPI-Signature': signature, ...headers },
      body: body ?? undefined,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const responseBody = (await res.text()).slice(0, 1000);
    return { status: res.ok ? 'success' : 'failed', responseStatus: res.status, responseBody, errorMessage: null };
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      return { status: 'timeout', responseStatus: null, responseBody: null, errorMessage: `Request timed out after ${timeoutMs}ms` };
    }
    return { status: 'failed', responseStatus: null, responseBody: null, errorMessage: err.message?.slice(0, 500) ?? 'Unknown error' };
  }
}

export async function runJob(job: {
  id: string;
  endpoint_url: string;
  http_method: string;
  headers: Record<string, string>;
  body: string | null;
  max_retries: number;
  notify_url: string | null;
  signing_secret: string;
  timeout_ms: number;
}): Promise<JobExecutionResult> {
  const startedAt = new Date();
  const maxRetries = job.max_retries ?? 3;
  const timeoutMs = Math.min(job.timeout_ms ?? 30_000, 120_000);

  const attempts: AttemptRecord[] = [];

  let attemptStart = Date.now();
  let lastResult = await attemptRequest(job.endpoint_url, job.http_method, job.headers, job.body, timeoutMs, job.signing_secret);
  attempts.push({ attemptNumber: 1, ...lastResult, durationMs: Date.now() - attemptStart, attemptedAt: new Date(attemptStart) });

  let retryCount = 0;
  while (lastResult.status !== 'success' && retryCount < maxRetries) {
    const delayMs = RETRY_DELAYS_MS[retryCount] ?? 30_000;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    retryCount++;
    attemptStart = Date.now();
    lastResult = await attemptRequest(job.endpoint_url, job.http_method, job.headers, job.body, timeoutMs, job.signing_secret);
    attempts.push({ attemptNumber: retryCount + 1, ...lastResult, durationMs: Date.now() - attemptStart, attemptedAt: new Date(attemptStart) });
  }

  const finishedAt = new Date();
  const durationMs = finishedAt.getTime() - startedAt.getTime();

  const execResult = await db.query<{ id: string }>(
    `INSERT INTO job_executions (job_id, status, response_status, response_body, duration_ms, error_message, retry_count, started_at, finished_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
    [job.id, lastResult.status, lastResult.responseStatus, lastResult.responseBody, durationMs, lastResult.errorMessage, retryCount, startedAt, finishedAt]
  );
  const executionId = execResult.rows[0].id;

  // Log each individual delivery attempt
  for (const attempt of attempts) {
    db.query(
      `INSERT INTO delivery_attempts (execution_id, job_id, attempt_number, status, response_status, response_body, duration_ms, error_message, attempted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [executionId, job.id, attempt.attemptNumber, attempt.status, attempt.responseStatus, attempt.responseBody, attempt.durationMs, attempt.errorMessage, attempt.attemptedAt]
    ).catch(() => {}); // best-effort
  }

  // If all retries exhausted and still failed, push to dead letter queue (7-day retention)
  if (lastResult.status !== 'success') {
    db.query(
      `INSERT INTO dead_letter_queue (job_id, execution_id, endpoint_url, http_method, headers, body, error_message, attempt_count, failed_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW() + INTERVAL '7 days')`,
      [job.id, executionId, job.endpoint_url, job.http_method, JSON.stringify(job.headers), job.body, lastResult.errorMessage ?? `HTTP ${lastResult.responseStatus}`, attempts.length]
    ).catch(() => {}); // best-effort
  }

  if (lastResult.status !== 'success' && job.notify_url) {
    sendFailureNotification(job.notify_url, job.id, lastResult.errorMessage ?? `HTTP ${lastResult.responseStatus}`).catch(() => {});
  }

  return {
    id: executionId,
    jobId: job.id,
    status: lastResult.status,
    responseStatus: lastResult.responseStatus,
    responseBody: lastResult.responseBody,
    durationMs,
    errorMessage: lastResult.errorMessage,
    retryCount,
    startedAt,
    finishedAt,
  };
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
