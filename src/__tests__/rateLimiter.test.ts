import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '../lib/rateLimiter';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('allows first request', () => {
    const result = checkRateLimit('key-new-1', 10);
    expect(result.allowed).toBe(true);
    expect(result.retryAfterMs).toBeUndefined();
  });

  it('allows requests within limit', () => {
    const keyId = 'key-new-within';
    for (let i = 0; i < 5; i++) {
      const result = checkRateLimit(keyId, 10);
      expect(result.allowed).toBe(true);
    }
  });

  it('blocks when limit is reached', () => {
    const keyId = 'key-new-block';
    for (let i = 0; i < 3; i++) {
      checkRateLimit(keyId, 3);
    }
    const result = checkRateLimit(keyId, 3);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it('resets counter after time window expires', () => {
    const keyId = 'key-new-reset';
    for (let i = 0; i < 2; i++) {
      checkRateLimit(keyId, 2);
    }
    // Exceed limit
    expect(checkRateLimit(keyId, 2).allowed).toBe(false);

    // Advance past the 1 minute window
    vi.advanceTimersByTime(61_000);

    // Should be allowed again
    const result = checkRateLimit(keyId, 2);
    expect(result.allowed).toBe(true);
  });

  it('handles limit of 1', () => {
    const keyId = 'key-new-one';
    expect(checkRateLimit(keyId, 1).allowed).toBe(true);
    expect(checkRateLimit(keyId, 1).allowed).toBe(false);
  });
});
