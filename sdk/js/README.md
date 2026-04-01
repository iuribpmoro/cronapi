# cronapi-js

Official JavaScript/TypeScript SDK for [CronAPI](https://cronapi.hakinsight.com) — HTTP cron job scheduling with zero dependencies.

## Installation

```bash
npm install cronapi-js
```

## Quickstart

```typescript
import { CronApiClient, register } from 'cronapi-js';

// 1. Register (once — save your API key!)
const { apiKey } = await register('you@example.com');

// 2. Create a client
const client = new CronApiClient({ apiKey });

// 3. Create a job
const { job } = await client.createJob({
  name: 'Daily report',
  endpointUrl: 'https://yourapp.com/webhooks/report',
  cronExpression: '0 9 * * *',   // every day at 9am UTC
  httpMethod: 'POST',
});

console.log('Job created:', job.id);

// 4. List all jobs
const { jobs } = await client.listJobs();

// 5. Trigger immediately
const { execution } = await client.triggerJob(job.id);

// 6. Check stats
const { stats } = await client.getJobStats(job.id);
console.log('Success rate (24h):', stats.last24h.successRate);
```

## API Reference

### `register(email, baseUrl?)`

Register a new account. Returns the API key — **save it, it will not be shown again**.

### `CronApiClient`

All methods are async and throw a `CronApiError` on non-2xx responses.

#### Auth

| Method | Description |
|--------|-------------|
| `getMe()` | Get current user profile |
| `listKeys()` | List API keys |
| `createKey(name?)` | Create a new API key |
| `revokeKey(keyId)` | Revoke an API key |

#### Jobs

| Method | Description |
|--------|-------------|
| `listJobs()` | List all jobs |
| `createJob(params)` | Create a job |
| `getJob(jobId)` | Get a job by ID |
| `updateJob(jobId, params)` | Partial update a job |
| `deleteJob(jobId)` | Delete a job |
| `triggerJob(jobId)` | Manually trigger a job |
| `listExecutions(jobId, options?)` | Paginated execution history |
| `getJobStats(jobId)` | Aggregated 24h / 7d stats |

### `createJob` params

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | string | yes | — | Display name |
| `endpointUrl` | string | yes | — | HTTPS URL to call |
| `cronExpression` | string | yes | — | Cron schedule (`* * * * *`) |
| `httpMethod` | string | no | `GET` | GET, POST, PUT, PATCH, DELETE |
| `headers` | object | no | `{}` | Request headers |
| `body` | string | no | — | Request body |
| `notifyUrl` | string | no | — | Webhook for execution results |
| `maxRetries` | number | no | `3` | 0–5 |
| `timeoutMs` | number | no | `30000` | 1000–120000 ms |

### Error handling

```typescript
import { CronApiClient, CronApiError } from 'cronapi-js';

try {
  await client.createJob({ ... });
} catch (err) {
  if (err instanceof Error && 'status' in err) {
    const apiError = err as CronApiError;
    console.error(apiError.status, apiError.message);
  }
}
```

## Requirements

- Node.js 18+ (uses native `fetch`)
- Works in modern browsers and edge runtimes (Cloudflare Workers, Deno, Bun)
