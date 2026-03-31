# Quick Start — CronAPI in 5 Minutes

Schedule your first HTTP job and verify it runs, end to end.

---

## Prerequisites

- A terminal with `curl` available
- A publicly reachable endpoint (or a tool like [webhook.site](https://webhook.site) for testing)

---

## Step 1 — Sign Up and Get Your API Key

```bash
curl -X POST https://api.cronapi.dev/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

**Response**

```json
{
  "message": "Registration successful. Save your API key — it will not be shown again.",
  "userId": "a1b2c3d4-e5f6-...",
  "email": "you@example.com",
  "plan": "free",
  "apiKey": "cron_live_xxxxxxxxxxxx",
  "keyId": "key_abc123"
}
```

> **Save your API key now.** It is shown once at registration and cannot be retrieved again. If you lose it, generate a new one via `POST /api/v1/auth/keys`.

Set it as a shell variable so the rest of this guide works without copy-pasting:

```bash
export CRONAPI_KEY="cron_live_xxxxxxxxxxxx"
```

---

## Step 2 — Create Your First Job

Create a job that calls your endpoint every hour:

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hourly ping",
    "endpointUrl": "https://yourapp.com/tasks/run",
    "cronExpression": "0 * * * *",
    "httpMethod": "POST",
    "body": "{\"source\": \"cronapi\"}"
  }'
```

**Response** `201 Created`

```json
{
  "job": {
    "id": "job_uuid",
    "name": "Hourly ping",
    "endpointUrl": "https://yourapp.com/tasks/run",
    "cronExpression": "0 * * * *",
    "httpMethod": "POST",
    "body": "{\"source\": \"cronapi\"}",
    "enabled": true,
    "maxRetries": 3,
    "timeoutMs": 30000,
    "signingSecret": "a3f8c2...",
    "nextRunAt": "2024-06-01T13:00:00.000Z",
    "createdAt": "2024-06-01T12:05:00.000Z"
  }
}
```

Note the `signingSecret` — use it to verify incoming requests are from CronAPI. See [Webhook Verification](./webhook-verification.md).

**Common cron expressions**

| Expression     | Schedule                  |
|----------------|---------------------------|
| `* * * * *`    | Every minute (Indie/Pro)  |
| `0 * * * *`    | Every hour                |
| `0 9 * * 1-5`  | Weekdays at 9 AM UTC      |
| `0 0 * * *`    | Daily at midnight UTC     |
| `0 0 1 * *`    | First of every month      |

---

## Step 3 — List Your Jobs

```bash
curl https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY"
```

**Response**

```json
{
  "jobs": [
    {
      "id": "job_uuid",
      "name": "Hourly ping",
      "enabled": true,
      "nextRunAt": "2024-06-01T13:00:00.000Z",
      "lastRunAt": null,
      ...
    }
  ]
}
```

---

## Step 4 — Check Execution History

After your job fires, inspect what happened:

```bash
curl https://api.cronapi.dev/api/v1/jobs/job_uuid/executions \
  -H "Authorization: Bearer $CRONAPI_KEY"
```

**Response**

```json
{
  "executions": [
    {
      "id": "exec_uuid",
      "jobId": "job_uuid",
      "startedAt": "2024-06-01T13:00:01.000Z",
      "finishedAt": "2024-06-01T13:00:01.312Z",
      "statusCode": 200,
      "responseBody": "{\"ok\": true}",
      "error": null
    }
  ]
}
```

A `statusCode` of 200–299 means success. Anything else triggers a retry (up to `maxRetries`).

---

## Step 5 — Update or Disable a Job

Pause a job without deleting it:

```bash
curl -X PATCH https://api.cronapi.dev/api/v1/jobs/job_uuid \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Change its schedule:

```bash
curl -X PATCH https://api.cronapi.dev/api/v1/jobs/job_uuid \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cronExpression": "0 9 * * 1-5"}'
```

---

## Next Steps

- [Verify webhook signatures](./webhook-verification.md) so your endpoint only accepts requests from CronAPI
- [Integrate with Next.js](./nextjs-integration.md) to trigger serverless functions on a schedule
- [Set up failure alerts](./monitoring-alerting.md) so you know when a job fails
