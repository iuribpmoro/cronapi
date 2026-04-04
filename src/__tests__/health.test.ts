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

import { db } from '../db/client';
import { buildApp } from '../app';

const mockQuery = vi.mocked(db.query);

describe('GET /health', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns ok when DB is available', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as any);

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
    expect(body.database).toBe('ok');
    expect(body.scheduler).toBe('running');
    expect(typeof body.uptime).toBe('number');
    expect(typeof body.timestamp).toBe('string');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('returns degraded when DB is unavailable', async () => {
    mockQuery.mockRejectedValueOnce(new Error('Connection refused'));

    const res = await app.inject({ method: 'GET', url: '/health' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('degraded');
    expect(body.database).toBe('error');
  });
});

describe('GET /status', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns active job count and next scheduled run', async () => {
    const nextRun = new Date('2026-04-01T00:00:00.000Z');
    mockQuery
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as any) // SELECT 1 (db health)
      .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [{ next_run_at: nextRun }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // lastExec

    const res = await app.inject({ method: 'GET', url: '/status' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.activeJobs).toBe(5);
    expect(body.nextScheduledRun).toBeDefined();
    expect(typeof body.uptime).toBe('number');
  });

  it('returns zero jobs and null next run when no jobs exist', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ '?column?': 1 }], rowCount: 1 } as any) // SELECT 1 (db health)
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any); // lastExec

    const res = await app.inject({ method: 'GET', url: '/status' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.activeJobs).toBe(0);
    expect(body.nextScheduledRun).toBeNull();
  });

  it('includes last error when a job has failed', async () => {
    const lastError = {
      job_id: 'job-abc',
      status: 'failed',
      error_message: 'Connection timeout',
      started_at: new Date('2026-04-01T00:00:00.000Z'),
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 } as any)
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [lastError], rowCount: 1 } as any);

    const res = await app.inject({ method: 'GET', url: '/status' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.lastError).not.toBeNull();
    expect(body.lastError.jobId).toBe('job-abc');
    expect(body.lastError.status).toBe('failed');
    expect(body.lastError.message).toBe('Connection timeout');
  });
});

describe('GET /api/v1/pricing', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('returns plan pricing info', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/pricing' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.plans).toHaveLength(3);
    expect(body.plans[0].name).toBe('free');
    expect(body.plans[1].name).toBe('indie');
    expect(body.plans[2].name).toBe('pro');
  });
});
