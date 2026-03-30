# CronAPI — API Reference

Full endpoint documentation for CronAPI.

Base URL: `https://api.cronapi.dev`

---

## Authentication

All job endpoints require an API key passed as a Bearer token:

```
Authorization: Bearer cron_live_xxxxxxxxxxxx
```

---

## Auth Endpoints

### POST /api/v1/auth/register

Register a new account and receive an API key.

**Request body**

```json
{
  "email": "you@example.com"
}
```

**Response** `201 Created`

```json
{
  "message": "Registration successful. Save your API key — it will not be shown again.",
  "userId": "a1b2c3d4-...",
  "email": "you@example.com",
  "plan": "free",
  "apiKey": "cron_live_xxxxxxxxxxxx",
  "keyId": "key_abc123"
}
```

**Errors**

| Code | Reason |
|------|--------|
| `400` | Missing or invalid email |
| `409` | Email already registered |

---

### GET /api/v1/auth/me

Get the current authenticated user's info.

**Response** `200 OK`

```json
{
  "userId": "a1b2c3d4-...",
  "email": "you@example.com",
  "plan": "free"
}
```

---

### GET /api/v1/auth/keys

List all API keys for the authenticated user.

**Response** `200 OK`

```json
{
  "keys": [
    {
      "id": "key_abc123",
      "name": "Default",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "lastUsedAt": "2024-06-01T12:00:00.000Z"
    }
  ]
}
```

---

### POST /api/v1/auth/keys

Create a new API key.

**Request body** (optional)

```json
{
  "name": "Production Key"
}
```

**Response** `201 Created`

```json
{
  "message": "API key created. Save it — it will not be shown again.",
  "apiKey": "cron_live_yyyyyyyyyyyy",
  "keyId": "key_def456"
}
```

---

### DELETE /api/v1/auth/keys/:keyId

Revoke an API key. The key will stop working immediately.

**Response** `200 OK`

```json
{
  "message": "API key revoked"
}
```

**Errors**

| Code | Reason |
|------|--------|
| `404` | Key not found or doesn't belong to you |

---

## Job Endpoints

### Job Object

All job endpoints return job objects in this shape:

```json
{
  "id": "job_uuid",
  "name": "Daily report",
  "endpointUrl": "https://yourapp.com/tasks/report",
  "cronExpression": "0 9 * * *",
  "httpMethod": "POST",
  "headers": {
    "X-Secret": "mysecret"
  },
  "body": "{\"trigger\": \"scheduled\"}",
  "enabled": true,
  "nextRunAt": "2024-06-02T09:00:00.000Z",
  "lastRunAt": "2024-06-01T09:00:00.000Z",
  "createdAt": "2024-05-01T00:00:00.000Z",
  "updatedAt": "2024-06-01T09:00:00.000Z"
}
```

---

### GET /api/v1/jobs

List all jobs for the authenticated user.

**Response** `200 OK`

```json
{
  "jobs": [ /* array of job objects */ ]
}
```

---

### POST /api/v1/jobs

Create a new scheduled job.

**Request body**

```json
{
  "name": "Hourly ping",
  "endpointUrl": "https://yourapp.com/ping",
  "cronExpression": "0 * * * *",
  "httpMethod": "POST",
  "headers": {
    "Authorization": "Bearer mytoken"
  },
  "body": "{\"source\": \"cronapi\"}"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable job name |
| `endpointUrl` | string | Yes | Full URL to call. Must be a valid URL. |
| `cronExpression` | string | Yes | Standard 5-field cron expression (e.g. `0 * * * *`) |
| `httpMethod` | string | No | One of `GET`, `POST`, `PUT`, `PATCH`, `DELETE`. Defaults to `GET`. |
| `headers` | object | No | Key-value pairs sent as request headers |
| `body` | string | No | Raw request body string (e.g. JSON-stringified payload) |

**Cron expression examples**

| Expression | Schedule |
|------------|----------|
| `* * * * *` | Every minute (Indie/Pro only) |
| `0 * * * *` | Every hour |
| `0 9 * * 1-5` | Weekdays at 9am |
| `0 0 * * *` | Daily at midnight |
| `0 0 1 * *` | First of every month |

**Response** `201 Created`

```json
{
  "job": { /* job object */ }
}
```

**Errors**

| Code | Reason |
|------|--------|
| `400` | Missing required fields, invalid URL, or invalid cron expression |
| `402` | Plan limit reached (too many jobs or interval too frequent) |

---

### GET /api/v1/jobs/:jobId

Get a single job by ID.

**Response** `200 OK`

```json
{
  "job": { /* job object */ }
}
```

**Errors**

| Code | Reason |
|------|--------|
| `404` | Job not found |

---

### PATCH /api/v1/jobs/:jobId

Update one or more fields on a job. All fields are optional.

**Request body**

```json
{
  "name": "Updated name",
  "endpointUrl": "https://yourapp.com/new-endpoint",
  "cronExpression": "0 12 * * *",
  "httpMethod": "POST",
  "headers": {},
  "body": null,
  "enabled": false
}
```

**Response** `200 OK`

```json
{
  "job": { /* updated job object */ }
}
```

**Errors**

| Code | Reason |
|------|--------|
| `400` | Invalid URL or cron expression |
| `404` | Job not found |

---

### DELETE /api/v1/jobs/:jobId

Delete a job permanently.

**Response** `200 OK`

```json
{
  "message": "Job deleted"
}
```

**Errors**

| Code | Reason |
|------|--------|
| `404` | Job not found |

---

### GET /api/v1/jobs/:jobId/executions

Get the execution history for a job.

**Query parameters**

| Param | Type | Description |
|-------|------|-------------|
| `limit` | number | Max results to return. Default: `50`, max: `100`. |

**Response** `200 OK`

```json
{
  "executions": [
    {
      "id": "exec_uuid",
      "jobId": "job_uuid",
      "startedAt": "2024-06-01T09:00:01.000Z",
      "finishedAt": "2024-06-01T09:00:01.243Z",
      "statusCode": 200,
      "responseBody": "{\"ok\": true}",
      "error": null
    }
  ]
}
```

---

## System Endpoints

### GET /health

Internal health check. Returns DB connectivity and scheduler status.

**Response** `200 OK`

```json
{
  "status": "ok",
  "timestamp": "2024-06-01T12:00:00.000Z",
  "uptime": 3600.5,
  "database": "ok",
  "scheduler": "running"
}
```

`status` is `"degraded"` if the database is unreachable.

---

### GET /status

Public status page. Returns uptime, active job count, and next scheduled run.

**Response** `200 OK`

```json
{
  "uptime": 3600.5,
  "activeJobs": 42,
  "nextScheduledRun": "2024-06-01T12:01:00.000Z"
}
```

---

### GET /api/v1/pricing

Returns current pricing plans.

**Response** `200 OK`

```json
{
  "plans": [
    {
      "name": "free",
      "price": 0,
      "maxJobs": 10,
      "minIntervalMinutes": 60,
      "description": "Up to 10 jobs, hourly minimum"
    },
    {
      "name": "indie",
      "price": 9,
      "maxJobs": 100,
      "minIntervalMinutes": 1,
      "description": "Up to 100 jobs, every minute"
    },
    {
      "name": "pro",
      "price": 29,
      "maxJobs": null,
      "minIntervalMinutes": 1,
      "description": "Unlimited jobs, every minute"
    }
  ]
}
```

---

### POST /api/v1/waitlist

Join the waitlist before registering.

**Request body**

```json
{
  "email": "you@example.com"
}
```

**Response** `201 Created`

```json
{
  "message": "Added to waitlist!"
}
```

---

## Rate Limits

All endpoints are limited to **100 requests per minute** per IP. Exceeding this returns:

```json
{
  "error": "Too many requests. Please slow down."
}
```

---

## Error Format

All error responses follow this shape:

```json
{
  "error": "Human-readable error message"
}
```
