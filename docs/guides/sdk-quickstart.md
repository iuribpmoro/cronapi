# SDK Quickstart

CronAPI has official SDKs for JavaScript/TypeScript and Python. Both cover the full API surface and are the recommended way to integrate in application code.

---

## JavaScript / TypeScript

### Install

```bash
npm install cronapi-js
```

### Register and create your first job

```typescript
import { register, CronApiClient, CronApiError } from 'cronapi-js';

// Register once — save the API key, it won't be shown again
const { apiKey } = await register('you@example.com');

const client = new CronApiClient({ apiKey });

const { job } = await client.createJob({
  name: 'Daily report',
  endpointUrl: 'https://yourapp.com/webhooks/report',
  cronExpression: '0 9 * * *',   // every day at 9am UTC
  httpMethod: 'POST',
  headers: { 'X-Source': 'cronapi' },
});

console.log('Job created:', job.id, '— next run:', job.nextRunAt);
```

### List jobs and check stats

```typescript
const { jobs } = await client.listJobs();

const { stats } = await client.getJobStats(job.id);
console.log(`24h success rate: ${(stats.last24h.successRate * 100).toFixed(1)}%`);
```

### Trigger and paginate executions

```typescript
const { execution } = await client.triggerJob(job.id);
console.log('Execution status:', execution.status, execution.statusCode);

// Paginate execution history
const { executions, nextCursor } = await client.listExecutions(job.id, { limit: 20 });
```

### Error handling

```typescript
try {
  await client.createJob({ name: '', endpointUrl: 'bad', cronExpression: '...' });
} catch (err) {
  if (err instanceof Error && 'status' in err) {
    const e = err as CronApiError;
    console.error(`CronAPI error ${e.status}: ${e.message}`);
  }
}
```

---

## Python

### Install

```bash
pip install cronapi-python
```

### Sync client

```python
from cronapi import register, CronApiClient, CreateJobParams, CronApiError

# Register once — save the API key, it won't be shown again
result = register("you@example.com")

with CronApiClient(api_key=result.api_key) as client:
    job = client.create_job(CreateJobParams(
        name="Daily report",
        endpoint_url="https://yourapp.com/webhooks/report",
        cron_expression="0 9 * * *",
        http_method="POST",
    ))
    print("Job created:", job.id, "— next run:", job.next_run_at)

    stats = client.get_job_stats(job.id)
    print(f"24h success rate: {stats.last_24h.success_rate:.1%}")
```

### Async client

```python
import asyncio
from cronapi import AsyncCronApiClient, CreateJobParams

async def main():
    async with AsyncCronApiClient(api_key="cron_live_...") as client:
        jobs = await client.list_jobs()
        for job in jobs:
            execution = await client.trigger_job(job.id)
            print(job.name, "→", execution.status)

asyncio.run(main())
```

### Error handling

```python
from cronapi import CronApiClient, CronApiError

try:
    client.get_job("nonexistent-id")
except CronApiError as e:
    print(f"Error {e.status}: {e}")
```

---

## Next Steps

- [Full API reference](../openapi.yaml)
- [Webhook verification](./webhook-verification.md) — validate HMAC signatures
- [Next.js integration](./nextjs-integration.md)
- [Monitoring & alerting](./monitoring-alerting.md)
