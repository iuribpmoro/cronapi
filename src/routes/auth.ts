import { FastifyInstance } from 'fastify';
import { db } from '../db/client';
import { generateApiKey, listApiKeys, revokeApiKey } from '../lib/apiKeys';
import { authenticate } from '../middleware/auth';

export async function authRoutes(app: FastifyInstance) {
  // POST /api/v1/auth/register
  app.post<{ Body: { email: string } }>('/register', async (request, reply) => {
    const { email } = request.body ?? {};
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return reply.code(400).send({ error: 'Valid email required' });
    }

    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return reply.code(409).send({ error: 'Email already registered' });
    }

    const userResult = await db.query<{ id: string }>(
      'INSERT INTO users (email) VALUES ($1) RETURNING id',
      [email.toLowerCase()]
    );
    const userId = userResult.rows[0].id;
    const { raw, record } = await generateApiKey(userId, 'Default');

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
    if (!ok) return reply.code(404).send({ error: 'Key not found' });
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
      return reply.code(400).send({ error: 'Valid email required' });
    }
    try {
      await db.query('INSERT INTO waitlist (email) VALUES ($1)', [email.toLowerCase()]);
      return reply.code(201).send({ message: 'Added to waitlist!' });
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.send({ message: "You're already on the list." });
      }
      throw err;
    }
  });
}
