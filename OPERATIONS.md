# CronAPI Operations Guide

Production URL: **https://cronapi-7b98.onrender.com**

---

## Health Checks

### Quick status

```
GET https://cronapi-7b98.onrender.com/health
```

Returns:
```json
{
  "status": "ok",          // "ok" or "degraded"
  "timestamp": "...",
  "uptime": 3600,          // seconds since last restart
  "database": "ok",        // "ok" or "error"
  "scheduler": "running"
}
```

### Detailed status (jobs + last error)

```
GET https://cronapi-7b98.onrender.com/status
```

Returns:
```json
{
  "uptime": 3600,
  "activeJobs": 12,
  "nextScheduledRun": "2026-04-01T00:00:00.000Z",
  "lastError": {
    "jobId": "uuid",
    "status": "failed",
    "message": "Connection refused",
    "at": "2026-03-31T10:00:00.000Z"
  }
}
```

`lastError` is `null` if no failures have occurred.

---

## Logs (Render)

1. Go to [Render Dashboard](https://dashboard.render.com) → **cronapi** service → **Logs**
2. All application events are emitted as structured JSON. Key log lines:

| `msg`                  | Level  | Meaning                                    |
|------------------------|--------|--------------------------------------------|
| `health_check_ok`      | info   | Self-health check passed (every 5 min)     |
| `health_check_degraded`| warn   | DB or scheduler issue detected             |
| `health_check_failed`  | error  | Health endpoint unreachable                |
| `job_execution_failed` | error  | A scheduled job failed or timed out        |

Example error log:
```json
{"level":"error","time":"2026-03-31T10:00:05.000Z","msg":"job_execution_failed","jobId":"...","status":"failed","retryCount":3,"durationMs":32000,"responseStatus":503,"error":"Service Unavailable"}
```

To filter for errors only, search Render logs for `"level":"error"`.

---

## Self-Monitoring

The scheduler runs a self-health check every 5 minutes by calling `GET /health` against itself. Results appear in Render logs as `health_check_ok` or `health_check_degraded` / `health_check_failed`.

No external monitoring service is required.

---

## Common Issues

### Service shows "degraded"

- Database connection lost. Check Render → Environment → `DATABASE_URL` is set and the Postgres instance is running.
- Free-tier Render Postgres instances may sleep — the first request after inactivity may take a few seconds.

### Jobs not running

1. Check `GET /status` → `activeJobs` count
2. Check `GET /status` → `nextScheduledRun` — if `null`, no enabled jobs exist
3. Check Render logs for `job_execution_failed` entries
4. Verify the target endpoint is reachable from Render's egress IPs (no firewall blocking)

### Stripe webhooks not processing (payments not upgrading users)

See [MONA-31](/MONA/issues/MONA-31) — requires Stripe webhook endpoint to be registered in the Stripe dashboard with `STRIPE_WEBHOOK_SECRET` set in Render.

---

## Deployments

- Every push to `main` triggers an automatic redeploy on Render (zero-downtime rolling restart).
- Monitor the deploy in Render Dashboard → **Deploys** tab.
- DB migrations run automatically on startup via `npm run migrate` (see `render.yaml`).
