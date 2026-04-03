import { FastifyInstance } from 'fastify';
import cronParser from 'cron-parser';
import { db } from '../db/client';
import { authenticate } from '../middleware/auth';
import { getPlanLimits } from '../lib/limits';
import { checkUsageAndAlert } from '../lib/usageAlerts';
import { runJob } from '../lib/executeJob';
import { logConversionEvent } from '../lib/usageTracking';

interface Job {
  id: string;
  user_id: string;
  name: string;
  endpoint_url: string;
  cron_expression: string;
  http_method: string;
  headers: Record<string, string>;
  body: string | null;
  enabled: boolean;
  notify_url: string | null;
  max_retries: number;
  signing_secret: string;
  timeout_ms: number;
  next_run_at: Date | null;
  last_run_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function toJobResponse(job: Job) {
  return {
    id: job.id,
    name: job.name,
    endpointUrl: job.endpoint_url,
    cronExpression: job.cron_expression,
    httpMethod: job.http_method,
    headers: job.headers,
    body: job.body,
    enabled: job.enabled,
    notifyUrl: job.notify_url,
    maxRetries: job.max_retries,
    signingSecret: job.signing_secret,
    timeoutMs: job.timeout_ms,
    nextRunAt: job.next_run_at,
    lastRunAt: job.last_run_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}

function validateCron(expr: string): boolean {
  try {
    cronParser.parseExpression(expr);
    return true;
  } catch {
    return false;
  }
}

// SSRF protection: block private/loopback/link-local hostnames
const BLOCKED_HOSTNAME_PATTERNS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/, // link-local / cloud metadata
  /^::1$/,
  /^fc00:/i,
  /^fe80:/i,
  /^0\.0\.0\.0$/,
];

function validateEndpointUrl(raw: string): { ok: true } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: 'Only http and https URLs are allowed' };
  }

  const hostname = parsed.hostname;
  for (const pattern of BLOCKED_HOSTNAME_PATTERNS) {
    if (pattern.test(hostname)) {
      return { ok: false, reason: 'Endpoint URL targets a private or reserved address' };
    }
  }

  return { ok: true };
}

function nextRunAt(expr: string): Date {
  const interval = cronParser.parseExpression(expr);
  return interval.next().toDate();
}

export async function jobRoutes(app: FastifyInstance) {
  // GET /api/v1/jobs
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const result = await db.query<Job>(
      'SELECT * FROM jobs WHERE user_id = $1 ORDER BY created_at DESC',
      [request.user!.userId]
    );
    return reply.send({ jobs: result.rows.map(toJobResponse) });
  });

  // POST /api/v1/jobs
  app.post<{
    Body: {
      name: string;
      endpointUrl: string;
      cronExpression: string;
      httpMethod?: string;
      headers?: Record<string, string>;
      body?: string;
      notifyUrl?: string;
      maxRetries?: number;
      timeoutMs?: number;
    };
  }>('/', { preHandler: authenticate }, async (request, reply) => {
    const { name, endpointUrl, cronExpression, httpMethod = 'GET', headers = {}, body, notifyUrl, maxRetries = 3, timeoutMs = 30_000 } = request.body ?? {};

    if (!name || !endpointUrl || !cronExpression) {
      return reply.code(400).send({ error: 'name, endpointUrl, and cronExpression are required' });
    }

    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(httpMethod.toUpperCase())) {
      return reply.code(400).send({ error: 'Invalid httpMethod' });
    }

    const urlCheck = validateEndpointUrl(endpointUrl);
    if (!urlCheck.ok) {
      return reply.code(400).send({ error: urlCheck.reason });
    }

    if (notifyUrl) {
      try { new URL(notifyUrl); } catch {
        return reply.code(400).send({ error: 'Invalid notifyUrl' });
      }
    }

    if (!validateCron(cronExpression)) {
      return reply.code(400).send({ error: 'Invalid cron expression' });
    }

    if (typeof maxRetries !== 'number' || maxRetries < 0 || maxRetries > 5) {
      return reply.code(400).send({ error: 'maxRetries must be between 0 and 5' });
    }

    if (typeof timeoutMs !== 'number' || timeoutMs < 1000 || timeoutMs > 120_000) {
      return reply.code(400).send({ error: 'timeoutMs must be between 1000 and 120000' });
    }

    const { userId, plan } = request.user!;
    const limits = getPlanLimits(plan);

    const countResult = await db.query<{ count: string }>(
      'SELECT COUNT(*) as count FROM jobs WHERE user_id = $1',
      [userId]
    );
    if (parseInt(countResult.rows[0].count) >= limits.maxJobs) {
      return reply.code(402).send({
        error: `Plan limit reached. ${plan} plan allows ${limits.maxJobs} jobs. Upgrade at /pricing`,
      });
    }

    const interval = cronParser.parseExpression(cronExpression);
    const first = interval.next();
    const second = interval.next();
    const minutesBetween = Math.round((second.getTime() - first.getTime()) / 60000);
    if (minutesBetween < limits.minIntervalMinutes) {
      return reply.code(402).send({
        error: `Minimum interval for ${plan} plan is ${limits.minIntervalMinutes} minute(s). Upgrade for more frequent scheduling.`,
      });
    }

    const result = await db.query<Job>(
      `INSERT INTO jobs (user_id, name, endpoint_url, cron_expression, http_method, headers, body, notify_url, max_retries, timeout_ms, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [userId, name, endpointUrl, cronExpression, httpMethod.toUpperCase(), JSON.stringify(headers), body ?? null, notifyUrl ?? null, maxRetries, timeoutMs, nextRunAt(cronExpression)]
    );

    // Log first_job_created event when this is the user's first job
    if (parseInt(countResult.rows[0].count) === 0) {
      logConversionEvent(userId, 'first_job_created', { plan });
    }
    checkUsageAndAlert(userId, request.user!.email, request.user!.plan);

    return reply.code(201).send({ job: toJobResponse(result.rows[0]) });
  });

  // GET /api/v1/jobs/:jobId
  app.get<{ Params: { jobId: string } }>('/:jobId', { preHandler: authenticate }, async (request, reply) => {
    const result = await db.query<Job>(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [request.params.jobId, request.user!.userId]
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'Job not found' });
    return reply.send({ job: toJobResponse(result.rows[0]) });
  });

  // PATCH /api/v1/jobs/:jobId
  app.patch<{
    Params: { jobId: string };
    Body: { name?: string; endpointUrl?: string; cronExpression?: string; httpMethod?: string; headers?: Record<string, string>; body?: string; enabled?: boolean; notifyUrl?: string | null; maxRetries?: number; timeoutMs?: number };
  }>('/:jobId', { preHandler: authenticate }, async (request, reply) => {
    const existing = await db.query<Job>(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [request.params.jobId, request.user!.userId]
    );
    if (!existing.rows[0]) return reply.code(404).send({ error: 'Job not found' });

    const job = existing.rows[0];
    const updates = request.body ?? {};

    if (updates.endpointUrl !== undefined) {
      const urlCheck = validateEndpointUrl(updates.endpointUrl);
      if (!urlCheck.ok) {
        return reply.code(400).send({ error: urlCheck.reason });
      }
    }
    if (updates.notifyUrl) {
      try { new URL(updates.notifyUrl); } catch {
        return reply.code(400).send({ error: 'Invalid notifyUrl' });
      }
    }
    if (updates.cronExpression !== undefined && !validateCron(updates.cronExpression)) {
      return reply.code(400).send({ error: 'Invalid cron expression' });
    }
    if (updates.maxRetries !== undefined && (updates.maxRetries < 0 || updates.maxRetries > 5)) {
      return reply.code(400).send({ error: 'maxRetries must be between 0 and 5' });
    }

    if (updates.timeoutMs !== undefined && (updates.timeoutMs < 1000 || updates.timeoutMs > 120_000)) {
      return reply.code(400).send({ error: 'timeoutMs must be between 1000 and 120000' });
    }

    const cronExpr = updates.cronExpression ?? job.cron_expression;
    const result = await db.query<Job>(
      `UPDATE jobs SET
        name = $1, endpoint_url = $2, cron_expression = $3, http_method = $4,
        headers = $5, body = $6, enabled = $7, notify_url = $8, max_retries = $9,
        timeout_ms = $10, next_run_at = $11, updated_at = NOW()
       WHERE id = $12 AND user_id = $13 RETURNING *`,
      [
        updates.name ?? job.name,
        updates.endpointUrl ?? job.endpoint_url,
        cronExpr,
        updates.httpMethod?.toUpperCase() ?? job.http_method,
        JSON.stringify(updates.headers ?? job.headers),
        updates.body !== undefined ? updates.body : job.body,
        updates.enabled !== undefined ? updates.enabled : job.enabled,
        updates.notifyUrl !== undefined ? updates.notifyUrl : job.notify_url,
        updates.maxRetries !== undefined ? updates.maxRetries : job.max_retries,
        updates.timeoutMs !== undefined ? updates.timeoutMs : job.timeout_ms,
        nextRunAt(cronExpr),
        request.params.jobId,
        request.user!.userId,
      ]
    );

    return reply.send({ job: toJobResponse(result.rows[0]) });
  });

  // DELETE /api/v1/jobs/:jobId
  app.delete<{ Params: { jobId: string } }>('/:jobId', { preHandler: authenticate }, async (request, reply) => {
    const result = await db.query(
      'DELETE FROM jobs WHERE id = $1 AND user_id = $2 RETURNING id',
      [request.params.jobId, request.user!.userId]
    );
    if (!result.rows[0]) return reply.code(404).send({ error: 'Job not found' });
    return reply.send({ message: 'Job deleted' });
  });

  // GET /api/v1/jobs/:jobId/executions
  app.get<{ Params: { jobId: string }; Querystring: { limit?: string; cursor?: string } }>(
    '/:jobId/executions',
    { preHandler: authenticate },
    async (request, reply) => {
      const job = await db.query('SELECT id FROM jobs WHERE id = $1 AND user_id = $2', [
        request.params.jobId,
        request.user!.userId,
      ]);
      if (!job.rows[0]) return reply.code(404).send({ error: 'Job not found' });

      const limit = Math.min(parseInt(request.query.limit ?? '50'), 100);
      const { cursor } = request.query;

      let result;
      if (cursor) {
        result = await db.query(
          `SELECT * FROM job_executions
           WHERE job_id = $1 AND started_at < (SELECT started_at FROM job_executions WHERE id = $2)
           ORDER BY started_at DESC LIMIT $3`,
          [request.params.jobId, cursor, limit]
        );
      } else {
        result = await db.query(
          'SELECT * FROM job_executions WHERE job_id = $1 ORDER BY started_at DESC LIMIT $2',
          [request.params.jobId, limit]
        );
      }

      const nextCursor = result.rows.length === limit ? result.rows[result.rows.length - 1].id : undefined;
      return reply.send({ executions: result.rows, nextCursor });
    }
  );

  // GET /api/v1/jobs/:jobId/stats
  app.get<{ Params: { jobId: string } }>(
    '/:jobId/stats',
    { preHandler: authenticate },
    async (request, reply) => {
      const job = await db.query('SELECT id FROM jobs WHERE id = $1 AND user_id = $2', [
        request.params.jobId,
        request.user!.userId,
      ]);
      if (!job.rows[0]) return reply.code(404).send({ error: 'Job not found' });

      const result = await db.query<{
        total_24h: string; success_24h: string; failure_24h: string; avg_ms_24h: string | null;
        total_7d: string; success_7d: string; failure_7d: string; avg_ms_7d: string | null;
      }>(
        `SELECT
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours') AS total_24h,
          COUNT(*) FILTER (WHERE status = 'success' AND started_at >= NOW() - INTERVAL '24 hours') AS success_24h,
          COUNT(*) FILTER (WHERE status != 'success' AND started_at >= NOW() - INTERVAL '24 hours') AS failure_24h,
          AVG(duration_ms) FILTER (WHERE started_at >= NOW() - INTERVAL '24 hours') AS avg_ms_24h,
          COUNT(*) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days') AS total_7d,
          COUNT(*) FILTER (WHERE status = 'success' AND started_at >= NOW() - INTERVAL '7 days') AS success_7d,
          COUNT(*) FILTER (WHERE status != 'success' AND started_at >= NOW() - INTERVAL '7 days') AS failure_7d,
          AVG(duration_ms) FILTER (WHERE started_at >= NOW() - INTERVAL '7 days') AS avg_ms_7d
        FROM job_executions WHERE job_id = $1`,
        [request.params.jobId]
      );

      const r = result.rows[0];
      const total24h = parseInt(r.total_24h) || 0;
      const total7d = parseInt(r.total_7d) || 0;

      return reply.send({
        stats: {
          last24h: {
            totalRuns: total24h,
            successCount: parseInt(r.success_24h) || 0,
            failureCount: parseInt(r.failure_24h) || 0,
            successRate: total24h > 0 ? (parseInt(r.success_24h) || 0) / total24h : 0,
            avgResponseMs: r.avg_ms_24h ? Math.round(parseFloat(r.avg_ms_24h)) : 0,
          },
          last7d: {
            totalRuns: total7d,
            successCount: parseInt(r.success_7d) || 0,
            failureCount: parseInt(r.failure_7d) || 0,
            successRate: total7d > 0 ? (parseInt(r.success_7d) || 0) / total7d : 0,
            avgResponseMs: r.avg_ms_7d ? Math.round(parseFloat(r.avg_ms_7d)) : 0,
          },
        },
      });
    }
  );

  // POST /api/v1/jobs/:jobId/trigger
  app.post<{ Params: { jobId: string } }>(
    '/:jobId/trigger',
    { preHandler: authenticate },
    async (request, reply) => {
      const jobResult = await db.query<{
        id: string; endpoint_url: string; http_method: string;
        headers: Record<string, string>; body: string | null;
        notify_url: string | null; max_retries: number;
        signing_secret: string; timeout_ms: number;
      }>(
        'SELECT id, endpoint_url, http_method, headers, body, notify_url, max_retries, signing_secret, timeout_ms FROM jobs WHERE id = $1 AND user_id = $2',
        [request.params.jobId, request.user!.userId]
      );
      if (!jobResult.rows[0]) return reply.code(404).send({ error: 'Job not found' });

      const execution = await runJob(jobResult.rows[0]);
      return reply.code(200).send({ execution });
    }
  );

  // GET /api/v1/jobs/:jobId/executions/:executionId/attempts
  app.get<{ Params: { jobId: string; executionId: string } }>(
    '/:jobId/executions/:executionId/attempts',
    { preHandler: authenticate },
    async (request, reply) => {
      const job = await db.query('SELECT id FROM jobs WHERE id = $1 AND user_id = $2', [
        request.params.jobId,
        request.user!.userId,
      ]);
      if (!job.rows[0]) return reply.code(404).send({ error: 'Job not found' });

      const exec = await db.query('SELECT id FROM job_executions WHERE id = $1 AND job_id = $2', [
        request.params.executionId,
        request.params.jobId,
      ]);
      if (!exec.rows[0]) return reply.code(404).send({ error: 'Execution not found' });

      const result = await db.query(
        'SELECT * FROM delivery_attempts WHERE execution_id = $1 ORDER BY attempt_number ASC',
        [request.params.executionId]
      );
      return reply.send({ attempts: result.rows });
    }
  );

  // GET /api/v1/jobs/:jobId/dead-letters
  app.get<{ Params: { jobId: string }; Querystring: { includeReplayed?: string } }>(
    '/:jobId/dead-letters',
    { preHandler: authenticate },
    async (request, reply) => {
      const job = await db.query('SELECT id FROM jobs WHERE id = $1 AND user_id = $2', [
        request.params.jobId,
        request.user!.userId,
      ]);
      if (!job.rows[0]) return reply.code(404).send({ error: 'Job not found' });

      const includeReplayed = request.query.includeReplayed === 'true';
      const result = await db.query(
        `SELECT * FROM dead_letter_queue
         WHERE job_id = $1 AND expires_at > NOW()
         ${includeReplayed ? '' : 'AND replayed_at IS NULL'}
         ORDER BY failed_at DESC LIMIT 100`,
        [request.params.jobId]
      );
      return reply.send({ deadLetters: result.rows });
    }
  );

  // POST /api/v1/jobs/:jobId/dead-letters/:dlqId/replay
  app.post<{ Params: { jobId: string; dlqId: string } }>(
    '/:jobId/dead-letters/:dlqId/replay',
    { preHandler: authenticate },
    async (request, reply) => {
      const jobResult = await db.query<{
        id: string; signing_secret: string; notify_url: string | null;
        max_retries: number; timeout_ms: number;
      }>(
        'SELECT id, signing_secret, notify_url, max_retries, timeout_ms FROM jobs WHERE id = $1 AND user_id = $2',
        [request.params.jobId, request.user!.userId]
      );
      if (!jobResult.rows[0]) return reply.code(404).send({ error: 'Job not found' });

      const dlqResult = await db.query(
        'SELECT * FROM dead_letter_queue WHERE id = $1 AND job_id = $2 AND expires_at > NOW()',
        [request.params.dlqId, request.params.jobId]
      );
      if (!dlqResult.rows[0]) return reply.code(404).send({ error: 'Dead letter not found or expired' });

      const dlq = dlqResult.rows[0];
      const job = jobResult.rows[0];

      const execution = await runJob({
        id: job.id,
        endpoint_url: dlq.endpoint_url,
        http_method: dlq.http_method,
        headers: dlq.headers,
        body: dlq.body,
        notify_url: job.notify_url,
        signing_secret: job.signing_secret,
        max_retries: job.max_retries,
        timeout_ms: job.timeout_ms,
      });

      await db.query(
        'UPDATE dead_letter_queue SET replayed_at = NOW() WHERE id = $1',
        [request.params.dlqId]
      );

      return reply.send({ execution, replayed: true });
    }
  );

  // GET /api/v1/admin/metrics — aggregate metrics for internal use
  // Protected by ADMIN_SECRET env var (checked as Bearer token or ?secret= query param)
  app.get('/admin/metrics', async (request, reply) => {
    const adminSecret = process.env.ADMIN_SECRET;
    if (!adminSecret) return reply.code(503).send({ error: 'Admin metrics not enabled' });

    const provided =
      (request.headers.authorization?.startsWith('Bearer ') ? request.headers.authorization.slice(7) : null) ??
      (request.query as any).secret;

    if (provided !== adminSecret) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const [usersResult, jobsResult, execResult] = await Promise.all([
      db.query<{ total: string; free: string; indie: string; pro: string }>(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE plan = 'free') as free,
          COUNT(*) FILTER (WHERE plan = 'indie') as indie,
          COUNT(*) FILTER (WHERE plan = 'pro') as pro
        FROM users
      `),
      db.query<{ total: string; active: string }>(`
        SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE enabled = true) as active FROM jobs
      `),
      db.query<{ total_this_month: string; success_this_month: string; total_today: string }>(`
        SELECT
          COUNT(*) FILTER (WHERE DATE_TRUNC('month', started_at) = DATE_TRUNC('month', NOW())) as total_this_month,
          COUNT(*) FILTER (WHERE status = 'success' AND DATE_TRUNC('month', started_at) = DATE_TRUNC('month', NOW())) as success_this_month,
          COUNT(*) FILTER (WHERE started_at >= CURRENT_DATE) as total_today
        FROM job_executions
      `),
    ]);

    const u = usersResult.rows[0];
    const j = jobsResult.rows[0];
    const e = execResult.rows[0];

    return reply.send({
      users: {
        total: parseInt(u.total),
        free: parseInt(u.free),
        indie: parseInt(u.indie),
        pro: parseInt(u.pro),
        paid: parseInt(u.indie) + parseInt(u.pro),
      },
      jobs: {
        total: parseInt(j.total),
        active: parseInt(j.active),
        paused: parseInt(j.total) - parseInt(j.active),
      },
      executions: {
        thisMonth: parseInt(e.total_this_month),
        successThisMonth: parseInt(e.success_this_month),
        today: parseInt(e.total_today),
      },
      generatedAt: new Date().toISOString(),
    });
  });
}
