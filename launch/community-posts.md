# CronAPI — Dev Community Posts

---

## r/SideProject

**Title:** Launched CronAPI — a REST API for scheduling HTTP endpoints (no servers, free tier available)

**Body:**

Hey folks! Sharing my latest side project: **CronAPI**.

**What is it?** An API that lets you schedule HTTP endpoints using cron expressions. Register with email, get an API key, POST your jobs. No infrastructure to manage.

**Why I built it:** Every time I needed "call this URL every hour" on a side project, I ended up either spinning up a cheap VPS (overkill) or fighting with AWS Lambda cron configs (way too much boilerplate). I wanted something I could curl and be done with.

**Use cases:**
- Webhook triggers on a schedule
- Daily/weekly email digests
- Background job kickoff for serverless apps
- Health check pings
- Scheduled data syncs

**Pricing:** Free tier (10 jobs, hourly). Paid starts at $9/mo for every-minute scheduling and 100 jobs.

**Tech:** TypeScript + Fastify + PostgreSQL + Railway. MIT licensed.

Feedback welcome — especially on pricing, missing features, or use cases you'd need that aren't obvious from the current feature set.

→ [URL]

---

## r/webdev

**Title:** I built a dead-simple cron job API — schedule any HTTP endpoint without touching infrastructure

**Body:**

Hey r/webdev,

I kept running into the same problem on side projects: I need to call a URL on a schedule (trigger a webhook, run a nightly cleanup, send a digest) and the options are either:

a) Set up a real server with crontab
b) Cobble together AWS/GCP cloud schedulers with IAM hell
c) Use some expensive enterprise tool

So I built **CronAPI**. It's an HTTP API for scheduling HTTP endpoints on a cron schedule.

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

→ [URL]

---

## Dev.to Article Outline

**Title:** I Built CronAPI: Cron Jobs Without the Server Headache

**Tags:** webdev, api, serverless, productivity

**Outline:**

1. **The problem** — Why existing options (crontab, AWS EventBridge, GCP Cloud Scheduler) are overkill for simple scheduled HTTP calls
2. **What CronAPI does** — Register → API key → POST a job → endpoint runs on schedule
3. **Quick start walkthrough** — curl examples for register, create, list, update, delete
4. **Architecture overview** — PostgreSQL-backed scheduler loop, stateless design, execution history, API key hashing
5. **Use cases** — Webhooks, digests, health checks, serverless warmup, background jobs
6. **Pricing** — Free tier, Indie ($9/mo), Pro ($29/mo)
7. **What's next** — Retry logic, failure notifications, dashboard UI
8. **Call to action** — Try it, give feedback, what would make it useful for you?

→ [URL]

---

## Indie Hackers

**Title:** Launched CronAPI — cron jobs as a service, $0 to start

**Body:**

Hey IH! I just launched **CronAPI** — a REST API that lets you schedule HTTP endpoints on a cron schedule, no servers required.

**The backstory:** On pretty much every side project I build, I eventually need "call this URL every hour/day/week." The options have always been frustrating — crontab means maintaining a server, cloud schedulers mean IAM hell, and every SaaS solution I found was either overkill or expensive.

So I spent a week building CronAPI. The core idea: register with email, get an API key, POST a job with a URL and cron expression, and we call your endpoint on schedule.

**Business model:** Freemium SaaS.
- Free: 10 jobs, hourly minimum (enough for most hobby projects)
- Indie ($9/mo): 100 jobs, every-minute scheduling
- Pro ($29/mo): unlimited jobs

**Tech:** TypeScript + Fastify + PostgreSQL. Hosted on Railway. Total infra cost is very low to start.

**Current status:** Just launched. Looking for early users and feedback.

**Questions I'd love feedback on:**
- Is the pricing right for the use case?
- What features would push you from free → paid?
- Any use cases I'm missing?

→ [URL]
