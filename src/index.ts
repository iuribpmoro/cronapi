import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import path from 'path';
import { authRoutes, waitlistRoutes } from './routes/auth';
import { jobRoutes } from './routes/jobs';
import { webhookRoutes } from './routes/webhooks';
import { startScheduler } from './scheduler';
import { db } from './db/client';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
});

const startTime = Date.now();

async function bootstrap() {
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

  // Serve static landing page
  await app.register(staticFiles, {
    root: path.join(__dirname, '..', 'public'),
    prefix: '/',
  });

  // API routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(jobRoutes, { prefix: '/api/v1/jobs' });
  await app.register(webhookRoutes, { prefix: '/webhooks' });
  await app.register(waitlistRoutes, { prefix: '/api/v1/waitlist' });

  // Health check — includes DB connectivity and scheduler status
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
      uptime: (Date.now() - startTime) / 1000,
      database: dbStatus,
      scheduler: 'running',
    };
  });

  // Public status page — uptime, active jobs, next scheduled run
  app.get('/status', async () => {
    const [activeJobsResult, nextRunResult] = await Promise.all([
      db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs WHERE enabled = true'),
      db.query<{ next_run_at: Date }>('SELECT next_run_at FROM jobs WHERE enabled = true AND next_run_at IS NOT NULL ORDER BY next_run_at ASC LIMIT 1'),
    ]);
    return {
      uptime: (Date.now() - startTime) / 1000,
      activeJobs: parseInt(activeJobsResult.rows[0]?.count ?? '0', 10),
      nextScheduledRun: nextRunResult.rows[0]?.next_run_at ?? null,
    };
  });

  // Pricing info endpoint
  app.get('/api/v1/pricing', async () => ({
    plans: [
      { name: 'free', price: 0, maxJobs: 10, minIntervalMinutes: 60, description: 'Up to 10 jobs, hourly minimum' },
      { name: 'indie', price: 9, maxJobs: 100, minIntervalMinutes: 1, description: 'Up to 100 jobs, every minute' },
      { name: 'pro', price: 29, maxJobs: null, minIntervalMinutes: 1, description: 'Unlimited jobs, every minute' },
    ],
  }));

  const port = parseInt(process.env.PORT ?? '3000');
  const host = '0.0.0.0';

  await app.listen({ port, host });
  app.log.info(`CronAPI listening on ${host}:${port}`);

  // Verify DB connection
  try {
    await db.query('SELECT 1');
    app.log.info('Database connected');
  } catch (err) {
    app.log.error({ err }, 'Database connection failed');
    process.exit(1);
  }

  // Start the job scheduler
  startScheduler();
  app.log.info('Scheduler started');
}

bootstrap().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
