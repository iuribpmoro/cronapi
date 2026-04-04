import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../db/client', () => ({
  db: { query: vi.fn() },
}));

vi.mock('../lib/apiKeys', () => ({
  generateApiKey: vi.fn(),
  validateApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));

vi.mock('../lib/usageTracking', () => ({
  logConversionEvent: vi.fn(),
  logRequest: vi.fn(),
  trackUsage: vi.fn(),
  getUsageToday: vi.fn(),
}));

vi.mock('../lib/executeJob', () => ({
  runJob: vi.fn(),
}));

vi.mock('stripe', () => {
  const MockStripe = vi.fn().mockImplementation(function () {
    return {
      checkout: { sessions: { create: vi.fn() } },
    };
  });
  return { default: MockStripe };
});

import { db } from '../db/client';
import { validateApiKey } from '../lib/apiKeys';
import { buildApp } from '../app';

const mockQuery = vi.mocked(db.query);
const mockValidateApiKey = vi.mocked(validateApiKey);

const MOCK_USER = {
  email: 'test@example.com',
  plan: 'indie',
  onboarding_completed: true,
};

const MOCK_JOB = {
  id: 'job-dash-1',
  user_id: 'user-dash-1',
  name: 'Dashboard Job',
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

// Cookie value for authenticated requests
const AUTH_COOKIE = 'dashboard_key=ck_live_test';

function setupAuthMocks() {
  mockValidateApiKey.mockResolvedValue({ userId: 'user-dash-1', keyId: 'key-dash-1' });
  // db.query for getSessionUser: SELECT email, plan, onboarding_completed
  mockQuery.mockResolvedValueOnce({ rows: [MOCK_USER], rowCount: 1 } as any);
}

describe('Dashboard routes', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.resetAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /dashboard/login', () => {
    it('serves the login page', async () => {
      const res = await app.inject({ method: 'GET', url: '/dashboard/login' });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.body).toContain('Login');
    });
  });

  describe('POST /dashboard/login', () => {
    it('redirects to jobs on valid API key', async () => {
      mockValidateApiKey.mockResolvedValue({ userId: 'user-dash-1', keyId: 'key-dash-1' });

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/login',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'apiKey=ck_live_valid',
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/dashboard/jobs');
    });

    it('shows error page for invalid API key', async () => {
      mockValidateApiKey.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/login',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'apiKey=ck_live_invalid',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Invalid API key');
    });

    it('shows error page when no API key provided', async () => {
      mockValidateApiKey.mockResolvedValue(null);

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/login',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        payload: '',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('Invalid API key');
    });
  });

  describe('GET /dashboard/logout', () => {
    it('clears cookie and redirects to login', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/logout',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/dashboard/login');
    });
  });

  describe('GET /dashboard/ (root redirect)', () => {
    it('redirects authenticated user to /dashboard/jobs', async () => {
      setupAuthMocks();

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/dashboard/jobs');
    });

    it('redirects unauthenticated user to login', async () => {
      mockValidateApiKey.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/dashboard/' });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/dashboard/login');
    });
  });

  describe('GET /dashboard/jobs', () => {
    it('serves jobs list for authenticated user', async () => {
      setupAuthMocks();
      // jobs query + executions count query
      mockQuery
        .mockResolvedValueOnce({ rows: [MOCK_JOB], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/jobs',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('redirects new user with no jobs to onboarding', async () => {
      mockValidateApiKey.mockResolvedValue({ userId: 'user-dash-1', keyId: 'key-dash-1' });
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...MOCK_USER, onboarding_completed: false }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // no jobs

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/jobs',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/dashboard/onboarding');
    });

    it('redirects unauthenticated user to login', async () => {
      mockValidateApiKey.mockResolvedValue(null);

      const res = await app.inject({ method: 'GET', url: '/dashboard/jobs' });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/dashboard/login');
    });
  });

  describe('GET /dashboard/jobs/new', () => {
    it('serves the new job form', async () => {
      setupAuthMocks();

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/jobs/new',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('POST /dashboard/jobs (create)', () => {
    it('creates a job and redirects', async () => {
      setupAuthMocks();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/jobs',
        headers: { cookie: AUTH_COOKIE, 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=My+Job&endpointUrl=https%3A%2F%2Fexample.com%2Fping&cronExpression=0+*+*+*+*',
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toContain('/dashboard/jobs');
    });

    it('shows error when required fields missing', async () => {
      setupAuthMocks();

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/jobs',
        headers: { cookie: AUTH_COOKIE, 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=OnlyName',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('required');
    });

    it('shows error for invalid cron expression', async () => {
      setupAuthMocks();

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/jobs',
        headers: { cookie: AUTH_COOKIE, 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=Bad+Job&endpointUrl=https%3A%2F%2Fexample.com&cronExpression=bad-cron',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('cron');
    });

    it('shows error for invalid JSON headers', async () => {
      setupAuthMocks();

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/jobs',
        headers: { cookie: AUTH_COOKIE, 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'name=Bad+Headers&endpointUrl=https%3A%2F%2Fexample.com&cronExpression=0+*+*+*+*&headers=not+json',
      });

      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('JSON');
    });
  });

  describe('GET /dashboard/jobs/:jobId', () => {
    it('serves job detail page', async () => {
      setupAuthMocks();
      const statsRow = {
        total_24h: '5', success_24h: '4', failure_24h: '1', avg_ms_24h: '200',
        total_7d: '30', success_7d: '25', failure_7d: '5', avg_ms_7d: '220',
      };
      mockQuery
        .mockResolvedValueOnce({ rows: [MOCK_JOB], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)       // executions
        .mockResolvedValueOnce({ rows: [statsRow], rowCount: 1 } as any); // stats

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/jobs/job-dash-1',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('returns 404 for unknown job', async () => {
      setupAuthMocks();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/jobs/no-such-job',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('GET /dashboard/jobs/:jobId/edit', () => {
    it('serves edit form for existing job', async () => {
      setupAuthMocks();
      mockQuery.mockResolvedValueOnce({ rows: [MOCK_JOB], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/jobs/job-dash-1/edit',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });

    it('returns 404 for unknown job on edit', async () => {
      setupAuthMocks();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/jobs/no-such-job/edit',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /dashboard/jobs/:jobId/toggle', () => {
    it('toggles job enabled state', async () => {
      setupAuthMocks();
      mockQuery
        .mockResolvedValueOnce({ rows: [{ ...MOCK_JOB, enabled: true }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/jobs/job-dash-1/toggle',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(302);
    });

    it('returns 404 when job not found', async () => {
      setupAuthMocks();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/jobs/no-such-job/toggle',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe('POST /dashboard/jobs/:jobId/delete', () => {
    it('deletes a job and redirects', async () => {
      setupAuthMocks();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'POST',
        url: '/dashboard/jobs/job-dash-1/delete',
        headers: { cookie: AUTH_COOKIE },
      });

      // delete handler doesn't check existence, always redirects
      expect(res.statusCode).toBe(302);
    });
  });

  describe('GET /dashboard/onboarding', () => {
    it('serves the onboarding page', async () => {
      setupAuthMocks();

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/onboarding',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('GET /dashboard/billing', () => {
    it('serves the billing page', async () => {
      setupAuthMocks();
      // billing page runs 2 parallel queries
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 } as any)
        .mockResolvedValueOnce({ rows: [{ count: '15' }], rowCount: 1 } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/dashboard/billing',
        headers: { cookie: AUTH_COOKIE },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });
});
