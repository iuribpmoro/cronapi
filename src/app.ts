import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { randomUUID } from 'crypto';
import path from 'path';
import { authRoutes, waitlistRoutes, adminRoutes } from './routes/auth';
import { jobRoutes } from './routes/jobs';
import { webhookRoutes } from './routes/webhooks';
import { dashboardRoutes } from './routes/dashboard';
import { templateRoutes } from './routes/templates';
import { db } from './db/client';
import { logRequest } from './lib/usageTracking';

export const appStartTime = Date.now();
const kStartTime = Symbol('startTime');

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'silent',
    },
  });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      error: 'Too many requests. Please slow down.',
    }),
  });

  await app.register(cookie);
  await app.register(formbody);

  // Attach a unique request ID to every request and response
  app.addHook('onRequest', (request, reply, done) => {
    const requestId = randomUUID();
    (request as any).requestId = requestId;
    reply.header('x-request-id', requestId);
    (request as any)[kStartTime] = Date.now();
    done();
  });

  // Global error handler — normalizes all errors to structured format
  app.setErrorHandler((error, request, reply) => {
    const statusCode = error.statusCode ?? 500;
    const code = statusCode === 429 ? 'RATE_LIMITED'
      : statusCode === 401 ? 'UNAUTHORIZED'
      : statusCode === 403 ? 'FORBIDDEN'
      : statusCode === 404 ? 'NOT_FOUND'
      : statusCode >= 500 ? 'INTERNAL_ERROR'
      : 'REQUEST_ERROR';
    reply.code(statusCode).send({
      error: {
        code,
        message: statusCode >= 500 ? 'An internal error occurred' : (error.message ?? 'Request failed'),
        details: null,
      },
    });
  });

  if (process.env.NODE_ENV !== 'test') {
    await app.register(staticFiles, {
      root: path.join(__dirname, '..', 'public'),
      prefix: '/',
    });
  }

  // Request logging hook — only logs authenticated requests
  app.addHook('onResponse', (request, reply, done) => {
    const startTime = (request as any)[kStartTime];
    if (request.user?.keyId && startTime !== undefined) {
      const durationMs = Date.now() - startTime;
      const endpoint = request.routerPath ?? request.url;
      logRequest(request.user.keyId, request.method, endpoint, reply.statusCode, durationMs);
    }
    done();
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(jobRoutes, { prefix: '/api/v1/jobs' });
  await app.register(templateRoutes, { prefix: '/api/v1/templates' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(waitlistRoutes, { prefix: '/api/v1/waitlist' });
  await app.register(adminRoutes, { prefix: '/api/v1/admin' });
  await app.register(dashboardRoutes, { prefix: '/dashboard' });

  app.get('/api/docs', async (request, reply) => {
    return reply.redirect('/docs.html');
  });

  app.get('/health', async () => {
    let dbStatus = 'ok';
    try {
      await db.query('SELECT 1');
    } catch {
      dbStatus = 'error';
    }
    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - appStartTime) / 1000,
      database: dbStatus,
      scheduler: 'running',
    };
  });

  async function getSystemStatus() {
    let dbStatus = 'ok';
    try { await db.query('SELECT 1'); } catch { dbStatus = 'error'; }
    const [activeJobsResult, nextRunResult, lastExecResult] = await Promise.all([
      db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs WHERE enabled = true'),
      db.query<{ next_run_at: Date }>(
        'SELECT next_run_at FROM jobs WHERE enabled = true AND next_run_at IS NOT NULL ORDER BY next_run_at ASC LIMIT 1'
      ),
      db.query<{ job_id: string; status: string; started_at: Date; finished_at: Date }>(
        `SELECT job_id, status, started_at, finished_at FROM job_executions ORDER BY started_at DESC LIMIT 1`
      ),
    ]);
    const lastExec = lastExecResult?.rows[0] ?? null;
    return {
      status: dbStatus === 'ok' ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - appStartTime) / 1000,
      database: dbStatus,
      scheduler: 'running',
      activeJobs: parseInt(activeJobsResult?.rows[0]?.count ?? '0', 10),
      nextScheduledRun: nextRunResult?.rows[0]?.next_run_at ?? null,
      lastExecution: lastExec
        ? { jobId: lastExec.job_id, status: lastExec.status, at: lastExec.finished_at ?? lastExec.started_at }
        : null,
    };
  }

  app.get('/status', async () => getSystemStatus());
  app.get('/api/v1/status', async () => getSystemStatus());

  app.get('/api/v1/pricing', async () => ({
    plans: [
      { name: 'free', price: 0, maxJobs: 10, minIntervalMinutes: 60, description: 'Up to 10 jobs, hourly minimum' },
      { name: 'indie', price: 9, maxJobs: 100, minIntervalMinutes: 1, description: 'Up to 100 jobs, every minute' },
      { name: 'pro', price: 29, maxJobs: null, minIntervalMinutes: 1, description: 'Unlimited jobs, every minute' },
    ],
  }));

  return app;
}
