/**
 * cronapi-js — Official JavaScript/TypeScript SDK for CronAPI
 * https://cronapi.hakinsight.com
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
export type Plan = 'free' | 'indie' | 'pro';

export interface Job {
  id: string;
  name: string;
  endpointUrl: string;
  cronExpression: string;
  httpMethod: HttpMethod;
  headers: Record<string, string>;
  body: string | null;
  enabled: boolean;
  notifyUrl: string | null;
  maxRetries: number;
  signingSecret: string;
  timeoutMs: number;
  nextRunAt: string | null;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateJobParams {
  name: string;
  endpointUrl: string;
  cronExpression: string;
  httpMethod?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  notifyUrl?: string;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface UpdateJobParams {
  name?: string;
  endpointUrl?: string;
  cronExpression?: string;
  httpMethod?: HttpMethod;
  headers?: Record<string, string>;
  body?: string;
  enabled?: boolean;
  notifyUrl?: string | null;
  maxRetries?: number;
  timeoutMs?: number;
}

export interface Execution {
  id: string;
  jobId: string;
  status: 'success' | 'failure' | 'timeout';
  statusCode: number | null;
  durationMs: number | null;
  responseBody: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface JobStats {
  last24h: {
    totalRuns: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgResponseMs: number;
  };
  last7d: {
    totalRuns: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgResponseMs: number;
  };
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface RegisterResult {
  message: string;
  userId: string;
  email: string;
  plan: Plan;
  apiKey: string;
  keyId: string;
}

export interface CreateKeyResult {
  message: string;
  apiKey: string;
  keyId: string;
}

export interface CronApiError extends Error {
  status: number;
  body: unknown;
}

export interface CronApiClientOptions {
  apiKey: string;
  baseUrl?: string;
}

function createError(status: number, body: unknown): CronApiError {
  const message =
    typeof body === 'object' && body !== null && 'error' in body
      ? String((body as { error: unknown }).error)
      : `HTTP ${status}`;
  const err = new Error(message) as CronApiError;
  err.status = status;
  err.body = body;
  return err;
}

export class CronApiClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: CronApiClientOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl ?? 'https://cronapi.hakinsight.com').replace(/\/$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}/api/v1${path}`;
    const init: RequestInit = {
      method,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
    };
    if (body !== undefined) {
      (init as any).body = JSON.stringify(body);
    }
    const res = await fetch(url, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) throw createError(res.status, data);
    return data as T;
  }

  // ─── Auth ───────────────────────────────────────────────────────────────────

  /** Get the current user's profile. */
  async getMe(): Promise<{ userId: string; email: string; plan: Plan }> {
    return this.request('GET', '/auth/me');
  }

  /** List API keys for the current user. */
  async listKeys(): Promise<{ keys: ApiKey[] }> {
    return this.request('GET', '/auth/keys');
  }

  /** Create a new API key. */
  async createKey(name?: string): Promise<CreateKeyResult> {
    return this.request('POST', '/auth/keys', { name });
  }

  /** Revoke an API key by its ID. */
  async revokeKey(keyId: string): Promise<{ message: string }> {
    return this.request('DELETE', `/auth/keys/${encodeURIComponent(keyId)}`);
  }

  // ─── Jobs ────────────────────────────────────────────────────────────────────

  /** List all jobs. */
  async listJobs(): Promise<{ jobs: Job[] }> {
    return this.request('GET', '/jobs');
  }

  /** Create a new cron job. */
  async createJob(params: CreateJobParams): Promise<{ job: Job }> {
    return this.request('POST', '/jobs', params);
  }

  /** Get a single job by ID. */
  async getJob(jobId: string): Promise<{ job: Job }> {
    return this.request('GET', `/jobs/${encodeURIComponent(jobId)}`);
  }

  /** Update a job (partial update). */
  async updateJob(jobId: string, params: UpdateJobParams): Promise<{ job: Job }> {
    return this.request('PATCH', `/jobs/${encodeURIComponent(jobId)}`, params);
  }

  /** Delete a job. */
  async deleteJob(jobId: string): Promise<{ message: string }> {
    return this.request('DELETE', `/jobs/${encodeURIComponent(jobId)}`);
  }

  /** Manually trigger a job execution. */
  async triggerJob(jobId: string): Promise<{ execution: Execution }> {
    return this.request('POST', `/jobs/${encodeURIComponent(jobId)}/trigger`);
  }

  /** List execution history for a job. */
  async listExecutions(
    jobId: string,
    options?: { limit?: number; cursor?: string }
  ): Promise<{ executions: Execution[]; nextCursor?: string }> {
    let path = `/jobs/${encodeURIComponent(jobId)}/executions`;
    const params = new URLSearchParams();
    if (options?.limit !== undefined) params.set('limit', String(options.limit));
    if (options?.cursor) params.set('cursor', options.cursor);
    const qs = params.toString();
    if (qs) path += `?${qs}`;
    return this.request('GET', path);
  }

  /** Get aggregated stats for a job. */
  async getJobStats(jobId: string): Promise<{ stats: JobStats }> {
    return this.request('GET', `/jobs/${encodeURIComponent(jobId)}/stats`);
  }
}

/**
 * Register a new CronAPI account (no auth required).
 * Returns the API key — save it, it will not be shown again.
 */
export async function register(
  email: string,
  baseUrl = 'https://cronapi.hakinsight.com'
): Promise<RegisterResult> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/v1/auth/register`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw createError(res.status, data);
  return data as RegisterResult;
}
