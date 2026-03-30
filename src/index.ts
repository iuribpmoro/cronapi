import { buildApp } from './app';
import { db } from './db/client';
import { startScheduler } from './scheduler';

async function bootstrap() {
  const app = await buildApp();
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
