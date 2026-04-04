import { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { authenticate } from '../middleware/auth';

function err(code: string, message: string, details: unknown = null) {
  return { error: { code, message, details } };
}

export async function accountRoutes(app: FastifyInstance) {
  // GET /api/v1/account/export
  // Returns all user data for GDPR data portability
  app.get('/export', { preHandler: authenticate }, async (request, reply) => {
    const { userId, email, plan } = request.user!;

    const [userResult, keysResult, jobsResult, executionsResult] = await Promise.all([
      db.query<{ email: string; plan: string; created_at: Date; onboarding_completed: boolean }>(
        `SELECT email, plan, created_at, onboarding_completed FROM users WHERE id = $1`,
        [userId]
      ),
      db.query<{ id: string; name: string; active: boolean; last_used_at: Date | null; created_at: Date }>(
        `SELECT id, name, active, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      ),
      db.query<{
        id: string; name: string; endpoint_url: string; cron_expression: string; http_method: string;
        enabled: boolean; next_run_at: Date | null; last_run_at: Date | null; created_at: Date;
      }>(
        `SELECT id, name, endpoint_url, cron_expression, http_method, enabled, next_run_at, last_run_at, created_at
         FROM jobs WHERE user_id = $1 ORDER BY created_at ASC`,
        [userId]
      ),
      db.query<{ id: string; job_id: string; status: string; response_status: number | null; duration_ms: number | null; retry_count: number; started_at: Date; finished_at: Date | null }>(
        `SELECT je.id, je.job_id, je.status, je.response_status, je.duration_ms, je.retry_count, je.started_at, je.finished_at
         FROM job_executions je
         JOIN jobs j ON j.id = je.job_id
         WHERE j.user_id = $1
         ORDER BY je.started_at DESC`,
        [userId]
      ),
    ]);

    return reply.send({
      exportedAt: new Date().toISOString(),
      profile: userResult.rows[0] ?? { email, plan },
      apiKeys: keysResult.rows,
      jobs: jobsResult.rows,
      executionHistory: executionsResult.rows,
    });
  });

  // DELETE /api/v1/account
  // Soft-deletes user and disables all associated resources (GDPR right to erasure)
  app.delete('/', { preHandler: authenticate }, async (request, reply) => {
    const { userId } = request.user!;

    await db.query('BEGIN');
    try {
      // Disable all API keys
      await db.query(`UPDATE api_keys SET active = false WHERE user_id = $1`, [userId]);

      // Disable all jobs
      await db.query(`UPDATE jobs SET enabled = false WHERE user_id = $1`, [userId]);

      // Soft-delete the user
      await db.query(
        `UPDATE users SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [userId]
      );

      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }

    return reply.send({
      message: 'Account scheduled for deletion. All jobs have been disabled and your data will be removed within 30 days.',
    });
  });
}
