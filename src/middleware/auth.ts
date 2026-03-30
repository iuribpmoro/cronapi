import { FastifyRequest, FastifyReply } from 'fastify';
import { validateApiKey } from '../lib/apiKeys';
import { db } from '../db/client';

export interface AuthUser {
  userId: string;
  keyId: string;
  email: string;
  plan: 'free' | 'indie' | 'pro';
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    reply.code(401).send({ error: 'Missing or invalid Authorization header. Use: Bearer <api_key>' });
    return;
  }

  const raw = authHeader.slice(7);
  const validated = await validateApiKey(raw);
  if (!validated) {
    reply.code(401).send({ error: 'Invalid or revoked API key' });
    return;
  }

  const userResult = await db.query<{ email: string; plan: string }>(
    'SELECT email, plan FROM users WHERE id = $1',
    [validated.userId]
  );

  if (userResult.rows.length === 0) {
    reply.code(401).send({ error: 'User not found' });
    return;
  }

  request.user = {
    userId: validated.userId,
    keyId: validated.keyId,
    email: userResult.rows[0].email,
    plan: userResult.rows[0].plan as AuthUser['plan'],
  };
}
