# cronapi-python

Official Python SDK for [CronAPI](https://cronapi.hakinsight.com) — HTTP cron job scheduling. Supports sync and async usage.

## Installation

```bash
pip install cronapi-python
```

## Quickstart (sync)

```python
from cronapi import register, CronApiClient, CreateJobParams

# 1. Register (once — save your API key!)
result = register("you@example.com")
print("API key:", result.api_key)  # save this!

# 2. Create a client
client = CronApiClient(api_key=result.api_key)

# 3. Create a job
job = client.create_job(CreateJobParams(
    name="Daily report",
    endpoint_url="https://yourapp.com/webhooks/report",
    cron_expression="0 9 * * *",  # every day at 9am UTC
    http_method="POST",
))
print("Job created:", job.id)

# 4. List jobs
jobs = client.list_jobs()

# 5. Trigger immediately
execution = client.trigger_job(job.id)

# 6. Stats
stats = client.get_job_stats(job.id)
print("Success rate (24h):", stats.last_24h.success_rate)

client.close()
```

Use as a context manager:

```python
with CronApiClient(api_key="your_key") as client:
    jobs = client.list_jobs()
```

## Async usage

```python
import asyncio
from cronapi import AsyncCronApiClient, CreateJobParams

async def main():
    async with AsyncCronApiClient(api_key="your_key") as client:
        job = await client.create_job(CreateJobParams(
            name="Hourly ping",
            endpoint_url="https://yourapp.com/ping",
            cron_expression="0 * * * *",
        ))
        execution = await client.trigger_job(job.id)
        print(execution.status)

asyncio.run(main())
```

## API Reference

### `register(email, base_url?)`

Register a new account. Returns `RegisterResult` with `api_key` — **save it, shown only once**.

### `CronApiClient` / `AsyncCronApiClient`

All methods raise `CronApiError` on non-2xx responses.

#### Auth

| Method | Description |
|--------|-------------|
| `get_me()` | Get current user profile → `UserProfile` |
| `list_keys()` | List API keys → `List[ApiKey]` |
| `create_key(name?)` | Create a key → `CreateKeyResult` |
| `revoke_key(key_id)` | Revoke a key → `str` (message) |

#### Jobs

| Method | Description |
|--------|-------------|
| `list_jobs()` | List all jobs → `List[Job]` |
| `create_job(params)` | Create a job → `Job` |
| `get_job(job_id)` | Get a job by ID → `Job` |
| `update_job(job_id, params)` | Partial update → `Job` |
| `delete_job(job_id)` | Delete a job → `str` (message) |
| `trigger_job(job_id)` | Trigger manually → `Execution` |
| `list_executions(job_id, limit?, cursor?)` | Execution history → `(List[Execution], next_cursor)` |
| `get_job_stats(job_id)` | Aggregated stats → `JobStats` |

### `CreateJobParams` fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `name` | str | yes | — | Display name |
| `endpoint_url` | str | yes | — | HTTPS URL to call |
| `cron_expression` | str | yes | — | Cron schedule |
| `http_method` | str | no | `GET` | GET/POST/PUT/PATCH/DELETE |
| `headers` | dict | no | `{}` | Request headers |
| `body` | str | no | — | Request body |
| `notify_url` | str | no | — | Webhook for results |
| `max_retries` | int | no | `3` | 0–5 |
| `timeout_ms` | int | no | `30000` | 1000–120000 ms |

### Error handling

```python
from cronapi import CronApiClient, CronApiError

try:
    client.create_job(...)
except CronApiError as e:
    print(e.status, e.message)
```

## Requirements

- Python 3.9+
- `httpx>=0.24.0`
