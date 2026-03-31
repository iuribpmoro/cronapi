import { FastifyRequest, FastifyReply } from 'fastify';
import { validateApiKey } from '../lib/apiKeys';
import { db } from '../db/client';
import { checkRateLimit } from '../lib/rateLimiter';
import { trackUsage } from '../lib/usageTracking';
import { getPlanLimits } from '../lib/limits';

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

  const plan = userResult.rows[0].plan as AuthUser['plan'];
  const limits = getPlanLimits(plan);
  const rateCheck = checkRateLimit(validated.keyId, limits.rateLimit);

  if (!rateCheck.allowed) {
    const retryAfter = Math.ceil((rateCheck.retryAfterMs ?? 60000) / 1000);
    reply
      .code(429)
      .header('Retry-After', String(retryAfter))
      .send({
        error: `Rate limit exceeded. ${plan} plan allows ${limits.rateLimit} requests/minute.`,
        retryAfterSeconds: retryAfter,
      });
    return;
  }

  request.user = {
    userId: validated.userId,
    keyId: validated.keyId,
    email: userResult.rows[0].email,
    plan,
  };

  // Track usage asynchronously — do not block the request
  trackUsage(validated.keyId);
}
