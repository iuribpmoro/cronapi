import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import { db } from '../db/client';

const BCRYPT_ROUNDS = 10;

export interface ApiKey {
  id: string;
  userId: string;
  keyPrefix: string;
  name: string;
  active: boolean;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface GeneratedKey {
  raw: string;
  record: ApiKey;
}

export async function generateApiKey(userId: string, name = 'Default'): Promise<GeneratedKey> {
  const raw = `ck_live_${nanoid(32)}`;
  const prefix = raw.substring(0, 14); // "ck_live_" + 6 chars
  const hash = await bcrypt.hash(raw, BCRYPT_ROUNDS);

  const result = await db.query<{
    id: string;
    user_id: string;
    key_prefix: string;
    name: string;
    active: boolean;
    last_used_at: Date | null;
    created_at: Date;
  }>(
    `INSERT INTO api_keys (user_id, key_hash, key_prefix, name)
     VALUES ($1, $2, $3, $4)
     RETURNING id, user_id, key_prefix, name, active, last_used_at, created_at`,
    [userId, hash, prefix, name]
  );

  const row = result.rows[0];
  return {
    raw,
    record: {
      id: row.id,
      userId: row.user_id,
      keyPrefix: row.key_prefix,
      name: row.name,
      active: row.active,
      lastUsedAt: row.last_used_at,
      createdAt: row.created_at,
    },
  };
}

export async function validateApiKey(raw: string): Promise<{ userId: string; keyId: string } | null> {
  if (!raw || !raw.startsWith('ck_live_')) return null;

  const prefix = raw.substring(0, 14);
  const result = await db.query<{ id: string; user_id: string; key_hash: string; active: boolean }>(
    `SELECT id, user_id, key_hash, active FROM api_keys WHERE key_prefix = $1 AND active = true`,
    [prefix]
  );

  if (result.rows.length === 0) return null;

  for (const row of result.rows) {
    const match = await bcrypt.compare(raw, row.key_hash);
    if (match) {
      // Update last_used_at without blocking the request
      db.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [row.id]).catch(() => {});
      return { userId: row.user_id, keyId: row.id };
    }
  }

  return null;
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const result = await db.query<{
    id: string;
    user_id: string;
    key_prefix: string;
    name: string;
    active: boolean;
    last_used_at: Date | null;
    created_at: Date;
  }>(
    `SELECT id, user_id, key_prefix, name, active, last_used_at, created_at
     FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId]
  );

  return result.rows.map((row) => ({
    id: row.id,
    userId: row.user_id,
    keyPrefix: row.key_prefix,
    name: row.name,
    active: row.active,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  }));
}

export async function revokeApiKey(keyId: string, userId: string): Promise<boolean> {
  const result = await db.query(
    `UPDATE api_keys SET active = false WHERE id = $1 AND user_id = $2`,
    [keyId, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
