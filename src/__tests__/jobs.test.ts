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
  authenticate: vi.fn(),
}));

vi.mock('../lib/usageTracking', () => ({
  logConversionEvent: vi.fn(),
  logRequest: vi.fn(),
  trackUsage: vi.fn(),
  getUsageToday: vi.fn(),
}));

import { db } from '../db/client';
import { authenticate } from '../middleware/auth';
import { buildApp } from '../app';

const mockQuery = vi.mocked(db.query);
const mockAuth = vi.mocked(authenticate);

const TEST_JOB = {
  id: 'job-abc',
  user_id: 'user-123',
  name: 'My Job',
  endpoint_url: 'https://example.com/ping',
  cron_expression: '0 * * * *',
  http_method: 'GET',
  headers: {},
  body: null,
  notify_url: null,
  max_retries: 3,
  signing_secret: null,
  timeout_ms: 30000,
  enabled: true,
  next_run_at: new Date('2026-04-01T01:00:00.000Z'),
  last_run_at: null,
  created_at: new Date('2026-03-31T00:00:00.000Z'),
  updated_at: new Date('2026-03-31T00:00:00.000Z'),
};

function setDefaultAuth() {
  mockAuth.mockImplementation(async (req: any) => {
    req.user = { userId: 'user-123', keyId: 'key-123', email: 'test@test.com', plan: 'indie' };
  });
}

describe('Job routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    setDefaultAuth();
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
      expect(JSON.parse(res.body).error.message).toContain('required');
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
      expect(JSON.parse(res.body).error.message).toContain('cron');
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
      expect(JSON.parse(res.body).error.message).toContain('endpointUrl');
    });

    it('returns 402 when plan job limit reached', async () => {
      mockAuth.mockImplementationOnce(async (req: any) => {
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
      expect(JSON.parse(res.body).error.message).toContain('Plan limit');
    });

    it('rejects SSRF endpoint targeting localhost', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'SSRF attempt',
          endpointUrl: 'http://localhost/admin',
          cronExpression: '0 * * * *',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('private');
    });

    it('rejects SSRF endpoint targeting internal IP', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'SSRF attempt 2',
          endpointUrl: 'http://192.168.1.1/secret',
          cronExpression: '0 * * * *',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('private');
    });

    it('rejects non-http protocol in endpoint URL', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'FTP job',
          endpointUrl: 'ftp://example.com/file',
          cronExpression: '0 * * * *',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('http');
    });

    it('rejects invalid httpMethod', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'Bad method',
          endpointUrl: 'https://example.com/ping',
          cronExpression: '0 * * * *',
          httpMethod: 'CONNECT',
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('httpMethod');
    });

    it('rejects out-of-range maxRetries', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'Bad retries',
          endpointUrl: 'https://example.com/ping',
          cronExpression: '0 * * * *',
          maxRetries: 10,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('maxRetries');
    });

    it('rejects out-of-range timeoutMs', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'Bad timeout',
          endpointUrl: 'https://example.com/ping',
          cronExpression: '0 * * * *',
          timeoutMs: 500,
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('timeoutMs');
    });

    it('returns 402 when cron interval is below plan minimum', async () => {
      // free plan requires 60+ minute interval
      mockAuth.mockImplementationOnce(async (req: any) => {
        req.user = { userId: 'user-123', keyId: 'key-123', email: 'test@test.com', plan: 'free' };
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/jobs',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: {
          name: 'Too frequent',
          endpointUrl: 'https://example.com/ping',
          cronExpression: '* * * * *', // every minute
        },
      });

      expect(res.statusCode).toBe(402);
      expect(JSON.parse(res.body).error.message).toContain('interval');
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
      expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/v1/jobs/:jobId', () => {
    it('updates a job successfully', async () => {
      const updatedJob = { ...TEST_JOB, name: 'Updated Job' };
      mockQuery
        .mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any)  // SELECT existing
        .mockResolvedValueOnce({ rows: [updatedJob], rowCount: 1 } as any); // UPDATE

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/jobs/job-abc',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: { name: 'Updated Job' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).job.name).toBe('Updated Job');
    });

    it('returns 404 when job not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/jobs/no-such-job',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: { name: 'New name' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('rejects invalid cron expression on update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/jobs/job-abc',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: { cronExpression: 'bad-cron' },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('cron');
    });

    it('rejects invalid endpoint URL on update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/jobs/job-abc',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: { endpointUrl: 'not-a-url' },
      });

      expect(res.statusCode).toBe(400);
    });

    it('rejects out-of-range maxRetries on update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'PATCH',
        url: '/api/v1/jobs/job-abc',
        headers: { authorization: 'Bearer ck_live_test', 'content-type': 'application/json' },
        payload: { maxRetries: -1 },
      });

      expect(res.statusCode).toBe(400);
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

  describe('GET /api/v1/jobs/:jobId/executions', () => {
    it('returns executions for a job', async () => {
      const execution = { id: 'exec-1', job_id: 'job-abc', status: 'success', started_at: new Date() };
      mockQuery
        .mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [execution], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/job-abc/executions',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).executions).toHaveLength(1);
    });

    it('returns 404 when job not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/no-such-job/executions',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(404);
    });

    it('uses cursor-based pagination', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/job-abc/executions?cursor=exec-1&limit=10',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(200);
    });
  });

  describe('GET /api/v1/jobs/:jobId/stats', () => {
    it('returns stats for a job', async () => {
      const statsRow = {
        total_24h: '10', success_24h: '8', failure_24h: '2', avg_ms_24h: '250.5',
        total_7d: '70', success_7d: '60', failure_7d: '10', avg_ms_7d: '300.0',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [TEST_JOB], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/job-abc/stats',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.stats.last24h.totalRuns).toBe(10);
      expect(body.stats.last24h.successRate).toBeCloseTo(0.8);
      expect(body.stats.last7d.totalRuns).toBe(70);
    });

    it('returns 404 when job not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/jobs/no-such-job/stats',
        headers: { authorization: 'Bearer ck_live_test' },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
