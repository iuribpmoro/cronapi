import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db/client', () => ({
  db: { query: vi.fn() },
}));

import { db } from '../db/client';
import { runJob } from '../lib/executeJob';

const mockQuery = vi.mocked(db.query);

const BASE_JOB = {
  id: 'job-123',
  endpoint_url: 'https://example.com/ping',
  http_method: 'GET',
  headers: {},
  body: null,
  max_retries: 0,
  notify_url: null,
  signing_secret: 'test-secret',
  timeout_ms: 5000,
};

function mockFetchSuccess(status = 200, body = 'ok') {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  } as any);
}

function mockFetchFailure(error: Error) {
  global.fetch = vi.fn().mockRejectedValue(error);
}

describe('runJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQuery.mockResolvedValue({ rows: [{ id: 'exec-1' }], rowCount: 1 } as any);
  });

  it('executes a successful job', async () => {
    mockFetchSuccess(200, 'pong');

    const result = await runJob(BASE_JOB);

    expect(result.status).toBe('success');
    expect(result.responseStatus).toBe(200);
    expect(result.responseBody).toBe('pong');
    expect(result.errorMessage).toBeNull();
    expect(result.retryCount).toBe(0);
    expect(result.jobId).toBe('job-123');
  });

  it('marks as failed on non-2xx response', async () => {
    mockFetchSuccess(500, 'Internal Server Error');

    const result = await runJob(BASE_JOB);

    expect(result.status).toBe('failed');
    expect(result.responseStatus).toBe(500);
  });

  it('handles timeout via AbortError', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetchFailure(abortError);

    const result = await runJob(BASE_JOB);

    expect(result.status).toBe('timeout');
    expect(result.responseStatus).toBeNull();
    expect(result.errorMessage).toContain('timed out');
  });

  it('handles network error', async () => {
    mockFetchFailure(new Error('ECONNREFUSED'));

    const result = await runJob(BASE_JOB);

    expect(result.status).toBe('failed');
    expect(result.responseStatus).toBeNull();
    expect(result.errorMessage).toBe('ECONNREFUSED');
  });

  it('retries on failure up to max_retries', async () => {
    vi.useFakeTimers();

    let callCount = 0;
    global.fetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount < 3) {
        return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('error') } as any);
      }
      return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve('ok') } as any);
    });

    const job = { ...BASE_JOB, max_retries: 2 };
    const runPromise = runJob(job);

    // Advance timers to get through retry delays
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(result.status).toBe('success');
    expect(result.retryCount).toBe(2);
    expect(callCount).toBe(3);

    vi.useRealTimers();
  });

  it('records failed job after exhausting retries', async () => {
    vi.useFakeTimers();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false, status: 503, text: () => Promise.resolve('unavailable'),
    } as any);

    const job = { ...BASE_JOB, max_retries: 1 };
    const runPromise = runJob(job);
    await vi.runAllTimersAsync();
    const result = await runPromise;

    expect(result.status).toBe('failed');
    expect(result.retryCount).toBe(1);

    vi.useRealTimers();
  });

  it('sends failure notification when notify_url is set', async () => {
    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: () => Promise.resolve('err') } as any)
      .mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve('notified') } as any);

    const job = { ...BASE_JOB, notify_url: 'https://notify.example.com/fail' };
    const result = await runJob(job);

    expect(result.status).toBe('failed');
    // fetch called twice: once for the job, once for notification
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('includes X-CronAPI-Signature header in request', async () => {
    mockFetchSuccess(200);

    await runJob({ ...BASE_JOB, signing_secret: 'my-secret', body: '{"data":1}' });

    const fetchCall = vi.mocked(global.fetch).mock.calls[0];
    const fetchOptions = fetchCall[1] as RequestInit;
    const headers = fetchOptions.headers as Record<string, string>;
    expect(headers['X-CronAPI-Signature']).toMatch(/^sha256=/);
  });

  it('inserts execution record into DB', async () => {
    mockFetchSuccess(200);

    await runJob(BASE_JOB);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO job_executions'),
      expect.any(Array)
    );
  });
});
