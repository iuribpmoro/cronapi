# CronAPI — Hacker News Show HN

---

**Title:** Show HN: CronAPI – schedule HTTP webhooks via a REST API (no servers, no crontabs)

**Body:**

I built CronAPI because I kept solving the same small problem across different projects: I need to call an HTTP endpoint on a schedule.

The obvious tools are either too heavy (EventBridge, GCP Cloud Scheduler), too tied to your platform (Vercel Cron, Railway cron), or brittle (setInterval inside a long-running process). I wanted something that treated scheduled HTTP calls as a first-class API resource.

**How it works:**

1. POST to `/api/v1/auth/register` with your email → get an API key
2. POST to `/api/v1/jobs` with a cron expression and target URL
3. CronAPI calls your endpoint on schedule

That's the entire user-facing surface. No SDK, no dashboard required (though Swagger UI is available).

**Under the hood:**

- Node.js + TypeScript + PostgreSQL
- Scheduler polls jobs every minute: `WHERE nextRunAt <= now() AND status = 'active'`
- HTTP calls are made with a configurable timeout; status code + latency + response body stored per execution (30-day retention)
- Rate limiting on the API (sliding window)
- Per-request logging for audit trail

**The limitation I'd call out honestly:** the scheduler is single-instance DB polling. It works fine at current scale but won't distribute horizontally. A BullMQ or pg-boss queue would be the right next step for HA.

**Pricing:** Free (10 jobs, ≥1h interval) / Indie $9/mo (100 jobs, per-minute) / Pro $29/mo (unlimited)

MIT licensed and self-hostable via Docker. Deploy to Railway with one click.

GitHub: https://github.com/iuribpmoro/cronapi
Live API: [URL]
Docs: [URL]/docs
