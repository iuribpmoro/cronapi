// In-memory sliding window rate limiter per API key
interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const store = new Map<string, RateLimitEntry>();
const WINDOW_MS = 60 * 1000; // 1 minute

// Periodically clean up old entries to prevent memory growth
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.windowStart > WINDOW_MS) {
      store.delete(key);
    }
  }
}, WINDOW_MS);

/**
 * Check if a key is within its rate limit.
 * Returns { allowed: true } or { allowed: false, retryAfterMs: number }
 */
export function checkRateLimit(
  keyId: string,
  limit: number
): { allowed: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = store.get(keyId);

  if (!entry || now - entry.windowStart >= WINDOW_MS) {
    store.set(keyId, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= limit) {
    const retryAfterMs = WINDOW_MS - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}
