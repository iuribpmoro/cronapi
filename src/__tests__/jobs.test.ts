import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../db/client', () => ({
  db: { query: vi.fn() },
}));

vi.mock('../lib/apiKeys', () => ({
  generateApiKey: vi.fn(),
  validateApiKey: vi.fn().mockResolvedValue({ userId: 'user-123', keyId: 'key-123' }),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock('../middleware/auth', () => ({
  authenticate: vi.fn(async (req: any) => {
    req.user = { userId: 'user-123', keyId: 'key-123', email: 'test@test.com', plan: 'indie' };
  }),
}));

import { db } from '../db/client';
import { buildApp } from '../app';

const mockQuery = vi.mocked(db.query);

const TEST_JOB = {
  id: 'job-abc',
  user_id: 'user-123',
  name: 'My Job',
  endpoint_url: 'https://example.com/ping',
  cron_expression: '0 * * * *',
  http_method: 'GET',
  headers: {},
  body: null,
  enabled: true,
  next_run_at: new Date('2026-04-01T01:00:00.000Z'),
  last_run_at: null,
  created_at: new Date('2026-03-31T00:00:00.000Z'),
  updated_at: new Date('2026-03-31T00:00:00.000Z'),
};

describe('Job routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/jobs', () => {
    it('returns list of jobs for authenticated user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.jobs).toHaveLength(1);
      expect(body.jobs[0].id).toBe('job-abc');
      expect(body.jobs[0].name).toBe('My Job');
    });

    it('returns empty list when user has no jobs', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).jobs).toHaveLength(0);
    });
  });

  describe('POST /api/v1/jobs', () => {
    it('creates a job with valid payload', async () => {
      // count check (plan limit) + insert
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'My Job',
          endpointUrl: 'https://example.com/ping',
          cronExpression: '0 * * * *',
        },
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.job.id).toBe('job-abc');
    });

    it('rejects missing required fields', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: { name: 'Only Name' },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('required');
    });

    it('rejects invalid cron expression', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'Bad Cron',
          endpointUrl: 'https://example.com/ping',
          cronExpression: 'not-a-cron',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('cron');
    });

    it('rejects invalid endpoint URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'Bad URL',
          endpointUrl: 'not-a-url',
          cronExpression: '0 * * * *',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error).toContain('endpointUrl');
    });

    it('returns 402 when plan job limit reached', async () => {
      // 10 jobs already (free plan limit — but user is on indie plan with 100 limit)
      // Let's simulate the limit being reached by making user free-plan in auth mock
      const { authenticate } = await import('../middleware/auth');
      vi.mocked(authenticate).mockImplementationOnce(async (req: any) => {
        req.user = { userId: 'user-123', keyId: 'key-123', email: 'test@test.com', plan: 'free' };
      });

      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'Over Limit',
          endpointUrl: 'https://example.com/ping',
          cronExpression: '0 * * * *',
        },
      });

      expect(res.statusCode).toBe(402);
      expect(JSON.parse(res.body).error).toContain('Plan limit');
    });
  });

  describe('GET /api/v1/jobs/:jobId', () => {
    it('returns a job by id', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/job-abc',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).job.id).toBe('job-abc');
    });

    it('returns 404 for unknown job', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/does-not-exist',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('DELETE /api/v1/jobs/:jobId', () => {
    it('deletes an existing job', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'job-abc' }], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/jobs/job-abc',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).message).toBe('Job deleted');
    });

    it('returns 404 when job does not belong to user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'DELETE',
        url: '/api/v1/jobs/other-users-job',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
