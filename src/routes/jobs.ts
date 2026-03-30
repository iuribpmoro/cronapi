import { FastifyInstance } from 'fastify';
import cronParser from 'cron-parser';
import { db } from '../db/client';
import { authenticate } from '../middleware/auth';
import { getPlanLimits } from '../lib/limits';

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
    };
  }>('/', { preHandler: authenticate }, async (request, reply) => {
    const { name, endpointUrl, cronExpression, httpMethod = 'GET', headers = {}, body } = request.body ?? {};

    if (!name || !endpointUrl || !cronExpression) {
      return reply.code(400).send({ error: 'name, endpointUrl, and cronExpression are required' });
    }

    if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(httpMethod.toUpperCase())) {
      return reply.code(400).send({ error: 'Invalid httpMethod' });
    }

    try { new URL(endpointUrl); } catch {
      return reply.code(400).send({ error: 'Invalid endpointUrl' });
    }

    if (!validateCron(cronExpression)) {
      return reply.code(400).send({ error: 'Invalid cron expression' });
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
    const minutesBetween = Math.round((interval.next().getTime() - Date.now()) / 60000);
    if (minutesBetween < limits.minIntervalMinutes) {
      return reply.code(402).send({
        error: `Minimum interval for ${plan} plan is ${limits.minIntervalMinutes} minute(s). Upgrade for more frequent scheduling.`,
      });
    }

    const result = await db.query<Job>(
      `INSERT INTO jobs (user_id, name, endpoint_url, cron_expression, http_method, headers, body, next_run_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, name, endpointUrl, cronExpression, httpMethod.toUpperCase(), JSON.stringify(headers), body ?? null, nextRunAt(cronExpression)]
    );

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
    Body: { name?: string; endpointUrl?: string; cronExpression?: string; httpMethod?: string; headers?: Record<string, string>; body?: string; enabled?: boolean };
  }>('/:jobId', { preHandler: authenticate }, async (request, reply) => {
    const existing = await db.query<Job>(
      'SELECT * FROM jobs WHERE id = $1 AND user_id = $2',
      [request.params.jobId, request.user!.userId]
    );
    if (!existing.rows[0]) return reply.code(404).send({ error: 'Job not found' });

    const job = existing.rows[0];
    const updates = request.body ?? {};

    if (updates.endpointUrl !== undefined) {
      try { new URL(updates.endpointUrl); } catch {
        return reply.code(400).send({ error: 'Invalid endpointUrl' });
      }
    }
    if (updates.cronExpression !== undefined && !validateCron(updates.cronExpression)) {
      return reply.code(400).send({ error: 'Invalid cron expression' });
    }

    const cronExpr = updates.cronExpression ?? job.cron_expression;
    const result = await db.query<Job>(
      `UPDATE jobs SET
        name = $1, endpoint_url = $2, cron_expression = $3, http_method = $4,
        headers = $5, body = $6, enabled = $7, next_run_at = $8, updated_at = NOW()
       WHERE id = $9 AND user_id = $10 RETURNING *`,
      [
        updates.name ?? job.name,
        updates.endpointUrl ?? job.endpoint_url,
        cronExpr,
        updates.httpMethod?.toUpperCase() ?? job.http_method,
        JSON.stringify(updates.headers ?? job.headers),
        updates.body !== undefined ? updates.body : job.body,
        updates.enabled !== undefined ? updates.enabled : job.enabled,
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
  app.get<{ Params: { jobId: string }; Querystring: { limit?: string } }>(
    '/:jobId/executions',
    { preHandler: authenticate },
    async (request, reply) => {
      const job = await db.query('SELECT id FROM jobs WHERE id = $1 AND user_id = $2', [
        request.params.jobId,
        request.user!.userId,
      ]);
      if (!job.rows[0]) return reply.code(404).send({ error: 'Job not found' });

      const limit = Math.min(parseInt(request.query.limit ?? '50'), 100);
      const result = await db.query(
        'SELECT * FROM job_executions WHERE job_id = $1 ORDER BY started_at DESC LIMIT $2',
        [request.params.jobId, limit]
      );
      return reply.send({ executions: result.rows });
    }
  );
}
