# CronAPI Operations Guide

Production URL: **https://cronapi.hakinsight.com**

---

## Health Checks

### Quick status

```
GET https://cronapi.hakinsight.com/health
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
GET https://cronapi.hakinsight.com/status
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

---

## Database Backups

### Current setup (free tier)

Render's free-tier Postgres does **not** include automated backups. The scheduler runs a daily snapshot at **02:00 UTC** that logs row counts for users, jobs, and executions:

```json
{"msg":"daily_backup_snapshot","activeUsers":42,"totalJobs":310,"totalExecutions":12840}
```

This snapshot detects data loss but does **not** produce a restorable dump.

### Upgrading to real backups

**Option A — Render managed backups (recommended):**
Upgrade the `cronapi-db` Postgres instance to a paid plan in the Render dashboard. Render will then take daily point-in-time snapshots automatically.

**Option B — External pg_dump:**
The app container (`node:20-alpine`) does not include `pg_dump`. To run dumps externally:
1. Add a separate cron service on Render (or a GitHub Action) that has `postgresql-client` installed.
2. Set `DATABASE_URL` and dump to S3/Backblaze B2/etc. with `pg_dump $DATABASE_URL | gzip | aws s3 cp - s3://bucket/backup-$(date +%F).sql.gz`.

### Migration version tracking

The `schema_migrations` table records applied migration versions. Inspect with:

```sql
SELECT * FROM schema_migrations ORDER BY applied_at;
```

---

## GDPR & Data Lifecycle

### User data export (data portability)

Users can download all their data via the API:

```
GET /api/v1/account/export
Authorization: Bearer <api_key>
```

Returns JSON with: profile, API keys, all jobs, and full execution history.

### Account deletion (right to erasure)

```
DELETE /api/v1/account
Authorization: Bearer <api_key>
```

- All API keys are immediately revoked (requests are rejected from that point on).
- All cron jobs are immediately disabled.
- The user record is soft-deleted (`deleted_at` set). All API calls with that user's keys will return 401.
- Hard-deletion of associated data is planned within 30 days of soft-delete.

**Note:** Execution history and conversion events are preserved for 30 days after deletion for audit/fraud purposes, then purged. If a user disputes a charge, this window allows investigation.
