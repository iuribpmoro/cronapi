# CronAPI — Dev Community Post Drafts

---

## Hacker News — Show HN

**Title:** Show HN: CronAPI – schedule HTTP endpoints via a REST API, no servers required

**Post body:**

Hey HN,

I built CronAPI because I kept reaching for crontab or cloud schedulers to do one simple thing: call a URL on a schedule.

The frustration: every "proper" solution (AWS EventBridge, GCP Cloud Scheduler, Lambda cron) involves setting up IAM roles, deployment configs, and cloud-specific tooling — all to fire an HTTP request on a schedule.

CronAPI is a simple HTTP API that does exactly that. You register, get an API key, and POST a job:

```bash
# Register
curl -X POST https://cronapi.dev/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
# → returns an API key (save it, shown once)

# Create a job
curl -X POST https://cronapi.dev/api/v1/jobs \
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

Tech stack: Node.js (Fastify), PostgreSQL, hosted on Railway.

Free tier: 10 jobs, hourly minimum. Paid plans unlock per-minute scheduling and more jobs.

Happy to answer questions about the architecture, tradeoffs, or why I made certain decisions. Feedback welcome.

→ https://cronapi.dev

---

## r/webdev

**Title:** I built a dead-simple cron job API — schedule any HTTP endpoint without touching infrastructure

**Body:**

Hey r/webdev,

I kept running into the same problem on side projects: I need to call a URL on a schedule (trigger a webhook, run a nightly cleanup, send a digest) and the options are either:

a) Set up a real server with crontab
b) Cobble together AWS/GCP cloud schedulers with IAM hell
c) Use some expensive enterprise tool

So I built CronAPI. It's an HTTP API for scheduling HTTP endpoints on a cron schedule.

**How it works:**
1. `POST /api/v1/auth/register` with your email → get an API key
2. `POST /api/v1/jobs` with a URL and cron expression
3. Your endpoint gets called on schedule

```json
{
  "name": "Weekly report",
  "endpointUrl": "https://yourapp.com/webhooks/weekly",
  "cronExpression": "0 9 * * 1",
  "httpMethod": "POST"
}
```

Supports custom HTTP methods, headers, and request bodies. Standard cron syntax.

**Pricing:**
- Free: 10 jobs, hourly minimum
- Indie ($9/mo): 100 jobs, every-minute scheduling
- Pro ($29/mo): unlimited jobs

Would love feedback on use cases I might be missing or things that seem clunky. What are you using for scheduled tasks right now?

→ https://cronapi.dev

---

## r/SideProject

**Title:** Launched CronAPI — a REST API for scheduling HTTP endpoints (no servers, free tier available)

**Body:**

Hey folks! Sharing my latest side project: **CronAPI**.

**What is it?** An API that lets you schedule HTTP endpoints using cron expressions. Register with email, get an API key, POST your jobs. No infrastructure to manage.

**Why I built it:** Every time I needed "call this URL every hour" on a side project, I ended up either spinning up a cheap VPS (overkill) or fighting with AWS Lambda cron configs (way too much boilerplate). I wanted something I could curl and be done with.

**Use cases I've been thinking about:**
- Webhook triggers on a schedule
- Daily/weekly email digests
- Background job kickoff for serverless apps
- Health check pings
- Scheduled data syncs

**Pricing:** Free tier (10 jobs, hourly). Paid starts at $9/mo for every-minute scheduling and 100 jobs.

**Tech:** Node.js + Fastify + PostgreSQL + Railway. Took about a week to build the MVP.

Feedback welcome — especially on pricing, missing features, or use cases you'd need that aren't obvious from the current feature set.

→ https://cronapi.dev

---

## Dev.to

**Title:** I built CronAPI: Cron Jobs Without the Server Headache

**Tags:** webdev, api, serverless, productivity

**Body:**

If you've ever needed to call a URL on a schedule — trigger a webhook every hour, run a daily report, warm up a cold serverless function — you know the options aren't great.

- **crontab** requires a server you have to maintain
- **AWS EventBridge / GCP Cloud Scheduler** requires IAM setup, cloud-specific configs, deployment pipelines
- **Render/Railway cron jobs** are per-service, not reusable

I built **CronAPI** to solve this for myself and, hopefully, for you too.

## What it does

CronAPI is a REST API that accepts a URL + cron expression and calls your endpoint on schedule. That's it.

## Quick start

**1. Register**

```bash
curl -X POST https://cronapi.dev/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

You get back an API key. **Save it — it's only shown once.**

**2. Create a job**

```bash
curl -X POST https://cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hourly sync",
    "endpointUrl": "https://yourapp.com/hooks/sync",
    "cronExpression": "0 * * * *",
    "httpMethod": "POST",
    "headers": { "x-api-secret": "your-secret" },
    "body": "{\"source\": \"cronapi\"}"
  }'
```

**3. Done**

Your endpoint will be called every hour. No servers. No crontab entries. No IAM policies.

## Managing jobs

```bash
# List jobs
GET /api/v1/jobs

# Get a specific job
GET /api/v1/jobs/:id

# Update a job (pause, change schedule, etc.)
PATCH /api/v1/jobs/:id

# Delete a job
DELETE /api/v1/jobs/:id
```

## Pricing

| Plan | Price | Jobs | Min interval |
|------|-------|------|-------------|
| Free | $0 | 10 | 1 hour |
| Indie | $9/mo | 100 | 1 minute |
| Pro | $29/mo | Unlimited | 1 minute |

## Tech stack

Built with Node.js (Fastify), PostgreSQL for job persistence, and `node-cron` for the scheduler. Hosted on Railway.

## What's next

- Job execution history / logs
- Retry logic on failure
- Slack/email notifications on failure
- Dashboard UI

Would love your feedback — what would make this more useful for your workflow?

→ https://cronapi.dev
