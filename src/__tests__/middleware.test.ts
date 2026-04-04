import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client', () => ({
  db: { query: vi.fn() },
}));

vi.mock('../lib/apiKeys', () => ({
  validateApiKey: vi.fn(),
}));

vi.mock('../lib/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockReturnValue({ allowed: true }),
}));

vi.mock('../lib/usageTracking', () => ({
  trackUsage: vi.fn(),
  logRequest: vi.fn(),
  logConversionEvent: vi.fn(),
  getUsageToday: vi.fn(),
}));

import { db } from '../db/client';
import { validateApiKey } from '../lib/apiKeys';
import { checkRateLimit } from '../lib/rateLimiter';
import { authenticate } from '../middleware/auth';

const mockQuery = vi.mocked(db.query);
const mockValidateApiKey = vi.mocked(validateApiKey);
const mockCheckRateLimit = vi.mocked(checkRateLimit);

function makeReq(headers: Record<string, string> = {}): any {
  return { headers, user: undefined };
}

function makeReply(): any {
  const reply: any = {};
  reply.code = vi.fn().mockReturnValue(reply);
  reply.send = vi.fn().mockReturnValue(reply);
  reply.header = vi.fn().mockReturnValue(reply);
  return reply;
}

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('rejects request with no Authorization header', async () => {
    const req = makeReq();
    const reply = makeReply();

    await authenticate(req, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 'UNAUTHORIZED' }) })
    );
    expect(req.user).toBeUndefined();
  });

  it('rejects request with non-Bearer Authorization header', async () => {
    const req = makeReq({ authorization: 'Basic abc123' });
    const reply = makeReply();

    await authenticate(req, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(req.user).toBeUndefined();
  });

  it('rejects invalid API key', async () => {
    mockValidateApiKey.mockResolvedValue(null);

    const req = makeReq({ authorization: 'Bearer ck_live_invalid' });
    const reply = makeReply();

    await authenticate(req, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('Invalid') }) })
    );
  });

  it('rejects when user not found in DB', async () => {
    mockValidateApiKey.mockResolvedValue({ userId: 'user-123', keyId: 'key-123' });
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 } as any);

    const req = makeReq({ authorization: 'Bearer ck_live_valid' });
    const reply = makeReply();

    await authenticate(req, reply);

    expect(reply.code).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ message: expect.stringContaining('not found') }) })
    );
  });

  it('rejects when rate limit exceeded', async () => {
    mockValidateApiKey.mockResolvedValue({ userId: 'user-123', keyId: 'key-123' });
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'test@test.com', plan: 'free' }], rowCount: 1 } as any);
    mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 45000 });

    const req = makeReq({ authorization: 'Bearer ck_live_valid' });
    const reply = makeReply();

    await authenticate(req, reply);

    expect(reply.code).toHaveBeenCalledWith(429);
    expect(reply.header).toHaveBeenCalledWith('Retry-After', expect.any(String));
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RATE_LIMITED' }),
        retryAfterSeconds: expect.any(Number),
      })
    );
  });

  it('sets req.user on successful authentication', async () => {
    mockValidateApiKey.mockResolvedValue({ userId: 'user-123', keyId: 'key-123' });
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'test@test.com', plan: 'indie' }], rowCount: 1 } as any);
    mockCheckRateLimit.mockReturnValue({ allowed: true });

    const req = makeReq({ authorization: 'Bearer ck_live_valid' });
    const reply = makeReply();

    await authenticate(req, reply);

    expect(req.user).toEqual({
      userId: 'user-123',
      keyId: 'key-123',
      email: 'test@test.com',
      plan: 'indie',
    });
    expect(reply.code).not.toHaveBeenCalled();
  });

  it('uses default retryAfterMs when not provided', async () => {
    mockValidateApiKey.mockResolvedValue({ userId: 'user-123', keyId: 'key-123' });
    mockQuery.mockResolvedValueOnce({ rows: [{ email: 'test@test.com', plan: 'free' }], rowCount: 1 } as any);
    mockCheckRateLimit.mockReturnValue({ allowed: false }); // no retryAfterMs

    const req = makeReq({ authorization: 'Bearer ck_live_valid' });
    const reply = makeReply();

    await authenticate(req, reply);

    expect(reply.code).toHaveBeenCalledWith(429);
    // Should use default 60000ms → 60 seconds
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ retryAfterSeconds: 60 })
    );
  });
});
