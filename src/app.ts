import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import cookie from '@fastify/cookie';
import path from 'path';
import { authRoutes, waitlistRoutes } from './routes/auth';
import { jobRoutes } from './routes/jobs';
import { webhookRoutes } from './routes/webhooks';
import { dashboardRoutes } from './routes/dashboard';
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

  app.addHook('onRequest', (request, reply, done) => {
    (request as any)[kStartTime] = Date.now();
    done();
  });

  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(jobRoutes, { prefix: '/api/v1/jobs' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(waitlistRoutes, { prefix: '/api/v1/waitlist' });
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

  app.get('/status', async () => {
    const [activeJobsResult, nextRunResult] = await Promise.all([
      db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs WHERE enabled = true'),
      db.query<{ next_run_at: Date }>(
        'SELECT next_run_at FROM jobs WHERE enabled = true AND next_run_at IS NOT NULL ORDER BY next_run_at ASC LIMIT 1'
      ),
    ]);
    return {
      uptime: (Date.now() - appStartTime) / 1000,
      activeJobs: parseInt(activeJobsResult.rows[0]?.count ?? '0', 10),
      nextScheduledRun: nextRunResult.rows[0]?.next_run_at ?? null,
    };
  });

  app.get('/api/v1/pricing', async () => ({
    plans: [
      { name: 'free', price: 0, maxJobs: 10, minIntervalMinutes: 60, description: 'Up to 10 jobs, hourly minimum' },
      { name: 'indie', price: 9, maxJobs: 100, minIntervalMinutes: 1, description: 'Up to 100 jobs, every minute' },
      { name: 'pro', price: 29, maxJobs: null, minIntervalMinutes: 1, description: 'Unlimited jobs, every minute' },
    ],
  }));

  return app;
}
