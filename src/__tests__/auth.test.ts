import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../db/client', () => ({
  db: { query: vi.fn() },
}));

vi.mock('../lib/apiKeys', () => ({
  generateApiKey: vi.fn().mockResolvedValue({
    raw: 'ck_live_testkey123',
    record: { id: 'key-001', userId: 'user-001', keyPrefix: 'ck_live_testk', name: 'Default', active: true, lastUsedAt: null, createdAt: new Date() },
  }),
  validateApiKey: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
}));

import { db } from '../db/client';
import { buildApp } from '../app';

const mockQuery = vi.mocked(db.query);

describe('POST /api/v1/auth/register', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 } as any);
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
  });

  it('returns 400 for invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      headers: { 'content-type': 'application/json' },
      payload: { email: 'not-an-email' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toContain('email');
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
    expect(JSON.parse(res.body).error).toContain('already registered');
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
});
