import { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { generateApiKey, listApiKeys, revokeApiKey } from '../lib/apiKeys';
import { authenticate } from '../middleware/auth';
import { logConversionEvent } from '../lib/usageTracking';

function err(code: string, message: string, details: unknown = null) {
  return { error: { code, message, details } };
}

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post<{ Body: { email: string } }>('/register', async (request, reply) => {
    const { email } = request.body ?? {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send(err('VALIDATION_ERROR', 'Valid email required'));
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return reply.code(409).send(err('CONFLICT', 'Email already registered'));
    }

    const userResult = await db.query<{ id: string }>(
      'INSERT INTO users (email) VALUES ($1) RETURNING id',
      [email.toLowerCase()]
    );
    const userId = userResult.rows[0].id;
    const { raw, record } = await generateApiKey(userId, 'Default');

    logConversionEvent(userId, 'registration', { email: email.toLowerCase() });

    return reply.code(201).send({
      message: 'Registration successful. Save your API key — it will not be shown again.',
      userId,
      email: email.toLowerCase(),
      plan: 'free',
      apiKey: raw,
      keyId: record.id,
    });
  });

  // GET /api/v1/auth/keys
  app.get('/keys', { preHandler: authenticate }, async (request, reply) => {
    const keys = await listApiKeys(request.user!.userId);
    return reply.send({ keys });
  });

  // POST /api/v1/auth/keys
  app.post<{ Body: { name?: string } }>('/keys', { preHandler: authenticate }, async (request, reply) => {
    const { name } = request.body ?? {};
    const { raw, record } = await generateApiKey(request.user!.userId, name ?? 'Key');
    return reply.code(201).send({
      message: 'API key created. Save it — it will not be shown again.',
      apiKey: raw,
      keyId: record.id,
    });
  });

  // DELETE /api/v1/auth/keys/:keyId
  app.delete<{ Params: { keyId: string } }>('/keys/:keyId', { preHandler: authenticate }, async (request, reply) => {
    const ok = await revokeApiKey(request.params.keyId, request.user!.userId);
    if (!ok) return reply.code(404).send(err('NOT_FOUND', 'Key not found'));
    return reply.send({ message: 'API key revoked' });
  });

  // GET /api/v1/auth/me
  app.get('/me', { preHandler: authenticate }, async (request, reply) => {
    const { userId, email, plan } = request.user!;
    return reply.send({ userId, email, plan });
  });
}

// Standalone waitlist route (no auth)
export async function waitlistRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string } }>('/', async (request, reply) => {
    const { email } = request.body ?? {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send(err('VALIDATION_ERROR', 'Valid email required'));
    }
    try {
      await db.query('INSERT INTO waitlist (email) VALUES ($1)', [email.toLowerCase()]);
      return reply.code(201).send({ message: 'Added to waitlist!' });
    } catch (error: any) {
      if (error.code === '23505') {
        return reply.send({ message: "You're already on the list." });
      }
      throw error;
    }
  });
}

// Admin routes — protected by ADMIN_SECRET header
export async function adminRoutes(app: FastifyInstance) {
  function requireAdminSecret(request: any, reply: any) {
    const secret = process.env.ADMIN_SECRET;
    if (!secret || request.headers['x-admin-secret'] !== secret) {
      reply.code(401).send(err('UNAUTHORIZED', 'Unauthorized'));
      return false;
    }
    return true;
  }

  app.get('/waitlist', async (request, reply) => {
    if (!requireAdminSecret(request, reply)) return;
    const result = await db.query<{ email: string; created_at: Date }>(
      'SELECT email, created_at FROM waitlist ORDER BY created_at ASC'
    );
    return reply.send({ count: result.rows.length, emails: result.rows });
  });

  app.get('/metrics', async (request, reply) => {
    if (!requireAdminSecret(request, reply)) return;

    const [
      totalUsersResult,
      activeUsersResult,
      totalJobsResult,
      jobsByPlanResult,
      executionsResult,
      conversionEventsResult,
    ] = await Promise.all([
      db.query<{ count: string }>('SELECT COUNT(*) as count FROM users'),
      db.query<{ count: string }>(
        `SELECT COUNT(DISTINCT u.id) as count FROM users u
         JOIN api_keys ak ON ak.user_id = u.id
         JOIN api_usage au ON au.key_id = ak.id
         WHERE au.date >= CURRENT_DATE - INTERVAL '7 days'`
      ),
      db.query<{ count: string }>('SELECT COUNT(*) as count FROM jobs'),
      db.query<{ plan: string; count: string }>(
        `SELECT u.plan, COUNT(j.id) as count FROM users u
         LEFT JOIN jobs j ON j.user_id = u.id
         GROUP BY u.plan`
      ),
      db.query<{ status: string; count: string }>(
        `SELECT status, COUNT(*) as count FROM job_executions
         WHERE started_at >= NOW() - INTERVAL '24 hours'
         GROUP BY status`
      ),
      db.query<{ event: string; count: string }>(
        `SELECT event, COUNT(*) as count FROM conversion_events GROUP BY event ORDER BY count DESC`
      ),
    ]);

    const executionsByStatus: Record<string, number> = {};
    for (const row of executionsResult.rows) {
      executionsByStatus[row.status] = parseInt(row.count, 10);
    }

    const jobsByPlan: Record<string, number> = {};
    for (const row of jobsByPlanResult.rows) {
      jobsByPlan[row.plan] = parseInt(row.count, 10);
    }

    const conversionCounts: Record<string, number> = {};
    for (const row of conversionEventsResult.rows) {
      conversionCounts[row.event] = parseInt(row.count, 10);
    }

    return reply.send({
      users: {
        total: parseInt(totalUsersResult.rows[0].count, 10),
        activeLast7d: parseInt(activeUsersResult.rows[0].count, 10),
      },
      jobs: {
        total: parseInt(totalJobsResult.rows[0].count, 10),
        byPlan: jobsByPlan,
      },
      executions: {
        last24h: executionsByStatus,
      },
      conversions: conversionCounts,
    });
  });
}
