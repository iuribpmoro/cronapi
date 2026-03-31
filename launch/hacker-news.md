# CronAPI — Hacker News Launch Post

## Show HN Post

**Title:** Show HN: CronAPI – schedule HTTP endpoints via a REST API, no servers required

**Body:**

Hey HN,

I built CronAPI because I kept reaching for crontab or cloud schedulers to do one simple thing: call a URL on a schedule.

The frustration: every "proper" solution (AWS EventBridge, GCP Cloud Scheduler, Lambda cron) involves setting up IAM roles, deployment configs, and cloud-specific tooling — all to fire an HTTP request on a schedule.

CronAPI is a simple HTTP API that does exactly that. You register, get an API key, and POST a job:

```bash
# Register
curl -X POST [URL]/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
# → returns an API key (save it, shown once)

# Create a job
curl -X POST [URL]/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily report",
    "endpointUrl": "https://yourapp.com/hooks/report",
    "cronExpression": "0 8 * * 1-5",
    "httpMethod": "POST",
    "headers": {"x-secret": "abc123"}
  }'
```

Your endpoint is called Monday–Friday at 8am. No server. No infrastructure.

**Architecture decisions worth mentioning:**

- **Scheduler loop:** Runs every minute, queries PostgreSQL for jobs due for execution (`nextRunAt <= now`), fires them, and writes back the next scheduled time using the cron expression. Simple and auditable.
- **No in-memory state:** All job state lives in PostgreSQL. The scheduler is stateless — restarts don't lose queued work.
- **API key model:** Keys are hashed before storage (bcrypt). The plain-text key is returned once at creation. This matches the model most developers expect from service APIs.
- **Execution history:** Every run is logged with the HTTP status, response body (truncated), and runtime. Retained for 30 days.
- **Rate limiting:** Sliding window per API key to prevent abuse on the free tier.

**Tech stack:** TypeScript, Fastify, PostgreSQL, node-cron. Deployable on Railway or Docker.

**Pricing:** Free tier: 10 jobs, hourly minimum. Indie ($9/mo): 100 jobs, per-minute. Pro ($29/mo): unlimited.

Happy to answer questions about the architecture, tradeoffs, or why I made certain decisions.

→ [URL]
