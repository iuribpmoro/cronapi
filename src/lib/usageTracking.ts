import { db } from '../db/client';

/**
 * Increment daily API usage counter for a key. Fire-and-forget.
 */
export function trackUsage(keyId: string): void {
  db.query(
    `INSERT INTO api_usage (key_id, date, request_count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (key_id, date) DO UPDATE SET request_count = api_usage.request_count + 1`,
    [keyId]
  ).catch(() => {});
}

/**
 * Log a single request. Fire-and-forget.
 */
export function logRequest(
  keyId: string,
  method: string,
  endpoint: string,
  statusCode: number,
  durationMs: number
): void {
  db.query(
    `INSERT INTO request_logs (key_id, method, endpoint, status_code, duration_ms)
     VALUES ($1, $2, $3, $4, $5)`,
    [keyId, method, endpoint, statusCode, durationMs]
  ).catch(() => {});
}

export async function getUsageToday(keyId: string): Promise<number> {
  const result = await db.query<{ request_count: string }>(
    `SELECT request_count FROM api_usage WHERE key_id = $1 AND date = CURRENT_DATE`,
    [keyId]
  );
  return parseInt(result.rows[0]?.request_count ?? '0', 10);
}
