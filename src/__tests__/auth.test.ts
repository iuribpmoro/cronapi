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
import { generateApiKey, validateApiKey, listApiKeys, revokeApiKey } from '../lib/apiKeys';
import { buildApp } from '../app';

const mockQuery = vi.mocked(db.query);
const mockGenerateApiKey = vi.mocked(generateApiKey);

const MOCK_API_KEY_RESULT = {
  raw: 'ck_live_testkey123',
  record: { id: 'key-001', userId: 'user-001', keyPrefix: 'ck_live_testk', name: 'Default', active: true, lastUsedAt: null, createdAt: new Date() },
};

describe('POST /api/v1/auth/register', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    mockGenerateApiKey.mockResolvedValue(MOCK_API_KEY_RESULT);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers a new user and returns an API key', async () => {
    // SELECT existing user (none found) + INSERT user
    mockQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 } as any)
      .mockResolvedValueOnce({ rows: [{ id: 'user-001' }], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'hello@example.com' },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.apiKey).toBe('ck_live_testkey123');
    expect(body.email).toBe('hello@example.com');
    expect(body.plan).toBe('free');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('returns 400 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.message).toContain('email');
  });

  it('returns 400 for missing email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });

    expect(res.statusCode).toBe(400);
  });

  it('returns 409 when email is already registered', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 'existing-user' }], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'taken@example.com' },
    });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.message).toContain('already registered');
  });
});

describe('POST /api/v1/waitlist', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('adds email to waitlist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 } as any);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'signup@example.com' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).message).toContain('waitlist');
  });

  it('returns friendly message for duplicate email', async () => {
    const dupError: any = new Error('unique violation');
    dupError.code = '23505';
    mockQuery.mockRejectedValueOnce(dupError);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'already@example.com' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toContain("already on the list");
  });

  it('returns 400 for invalid waitlist email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/waitlist',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'bad-email' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Admin routes /api/v1/admin', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.ADMIN_SECRET = 'super-secret';
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
    delete process.env.ADMIN_SECRET;
  });

  describe('GET /api/v1/admin/waitlist', () => {
    it('returns 401 when admin secret is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/waitlist' });
      expect(res.statusCode).toBe(401);
      expect(JSON.parse(res.body).error.code).toBe('UNAUTHORIZED');
    });

    it('returns 401 when admin secret is wrong', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/waitlist',
        headers: { 'x-admin-secret': 'wrong-secret' },
      });
      expect(res.statusCode).toBe(401);
    });

    it('returns waitlist emails when authorized', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { email: 'a@example.com', created_at: new Date() },
          { email: 'b@example.com', created_at: new Date() },
        ],
        rowCount: 2,
      } as any);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/waitlist',
        headers: { 'x-admin-secret': 'super-secret' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.count).toBe(2);
      expect(body.emails).toHaveLength(2);
    });
  });

  describe('GET /api/v1/admin/metrics', () => {
    it('returns 401 when admin secret is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/admin/metrics' });
      expect(res.statusCode).toBe(401);
    });

    it('returns metrics when authorized', async () => {
      // 6 parallel queries in metrics handler
      const baseCount = { rows: [{ count: '10' }], rowCount: 1 };
      mockQuery
        .mockResolvedValueOnce(baseCount as any)  // total users
        .mockResolvedValueOnce(baseCount as any)  // active users
        .mockResolvedValueOnce(baseCount as any)  // total jobs
        .mockResolvedValueOnce({ rows: [{ plan: 'free', count: '5' }, { plan: 'indie', count: '3' }], rowCount: 2 } as any)  // jobs by plan
        .mockResolvedValueOnce({ rows: [{ status: 'success', count: '8' }, { status: 'failed', count: '2' }], rowCount: 2 } as any)  // executions
        .mockResolvedValueOnce({ rows: [{ event: 'registration', count: '10' }], rowCount: 1 } as any);  // conversion events

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/metrics',
        headers: { 'x-admin-secret': 'super-secret' },
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.users.total).toBe(10);
      expect(body.jobs.total).toBe(10);
      expect(body.executions.last24h.success).toBe(8);
      expect(body.executions.last24h.failed).toBe(2);
    });
  });
});

describe('Auth key management /api/v1/auth', () => {
  let app: FastifyInstance;
  const mockValidateApiKey = vi.mocked(validateApiKey);
  const mockListApiKeys = vi.mocked(listApiKeys);
  const mockRevokeApiKey = vi.mocked(revokeApiKey);

  beforeEach(async () => {
    vi.clearAllMocks();
    // Set up auth middleware mock
    mockValidateApiKey.mockResolvedValue({ userId: 'user-001', keyId: 'key-001' });
    mockQuery.mockResolvedValue({ rows: [{ email: 'test@test.com', plan: 'indie' }], rowCount: 1 } as any);
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/v1/auth/me returns user info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
      headers: { authorization: 'Bearer ck_live_valid' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('test@test.com');
    expect(body.plan).toBe('indie');
  });

  it('GET /api/v1/auth/keys returns key list', async () => {
    mockListApiKeys.mockResolvedValue([]);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/keys',
      headers: { authorization: 'Bearer ck_live_valid' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).keys).toEqual([]);
  });

  it('POST /api/v1/auth/keys creates a new API key', async () => {
    mockGenerateApiKey.mockResolvedValue(MOCK_API_KEY_RESULT);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/keys',
      headers: { authorization: 'Bearer ck_live_valid', 'content-type': 'application/json' },
      payload: { name: 'My new key' },
    });

    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).apiKey).toBe('ck_live_testkey123');
  });

  it('DELETE /api/v1/auth/keys/:keyId revokes a key', async () => {
    mockRevokeApiKey.mockResolvedValue(true);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/keys/key-001',
      headers: { authorization: 'Bearer ck_live_valid' },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).message).toContain('revoked');
  });

  it('DELETE /api/v1/auth/keys/:keyId returns 404 for unknown key', async () => {
    mockRevokeApiKey.mockResolvedValue(false);

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/auth/keys/no-such-key',
      headers: { authorization: 'Bearer ck_live_valid' },
    });

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('NOT_FOUND');
  });

  it('returns 401 for requests without auth', async () => {
    mockValidateApiKey.mockResolvedValue(null);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/me',
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('UNAUTHORIZED');
  });
});
