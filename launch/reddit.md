# CronAPI — Reddit Launch Posts

---

## r/SideProject

**Title:** I got tired of spinning up servers just to run cron jobs, so I built CronAPI

**Body:**

Every side project I've built eventually needs something scheduled: send a daily digest email, ping a health-check URL, kick off a weekly report. The typical options are frustrating:

- Spin up a VPS just for cron — now you're maintaining a server for a 3-line crontab
- Use AWS EventBridge or GCP Cloud Scheduler — IAM rabbit holes, vendor lock-in, costs that creep up
- Hack `setInterval` into your Node app — dies every time your dyno restarts

So I built **CronAPI** — a hosted cron-as-a-service. You register, get an API key, and POST a job:

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily digest",
    "endpointUrl": "https://yourapp.com/hooks/digest",
    "cronExpression": "0 9 * * *",
    "httpMethod": "POST"
  }'
```

That's it. Your endpoint gets called every day at 9am. Execution history stored for 30 days so you can debug failures.

**Free tier:** 10 jobs, hourly minimum interval. No credit card required.

GitHub is public if you want to self-host: https://github.com/iuribpmoro/cronapi

Would love feedback — especially if you've solved this problem a different way.

---

## r/webdev

**Title:** Show r/webdev: CronAPI — schedule HTTP webhooks without managing cron infrastructure

**Body:**

Hey webdev — I built a small tool that solves a recurring headache: running scheduled HTTP calls without standing up servers.

**CronAPI** is a hosted cron-as-a-service API. Give it a cron expression and an endpoint URL, and it fires your webhook on schedule. Supports any HTTP method, custom headers, and request bodies.

**Why not just use [X]?**

- **Vercel Cron / Railway cron** — tied to your deployment platform, limited to your own routes
- **GitHub Actions scheduled** — great for CI, awkward for runtime webhooks, cold-starts on inactivity
- **AWS EventBridge** — powerful but 20 minutes of IAM config for a 3-line job
- **node-cron** — lives and dies with your process

CronAPI is stateless from your app's perspective: no SDK, no library, just a REST call to register a job and your endpoint receives POSTs on schedule.

**Stack:** Node.js, TypeScript, PostgreSQL, node-cron. MIT licensed and self-hostable via Docker or Railway.

**Pricing:** Free (10 jobs, hourly) → Indie $9/mo (100 jobs, per-minute) → Pro $29/mo (unlimited)

Live API docs: https://api.cronapi.dev/docs
GitHub: https://github.com/iuribpmoro/cronapi

Happy to answer technical questions or discuss architecture choices.

---

## r/programming

**Title:** CronAPI: cron-as-a-service via a REST API — no servers, no crontabs

**Body:**

I wanted scheduled HTTP calls without touching cron infrastructure, so I built CronAPI.

**The interface is a simple REST API:**

```bash
# Register
curl -X POST https://api.cronapi.dev/api/v1/auth/register \
  -d '{"email": "you@example.com"}'
# → returns apiKey

# Create a job
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer YOUR_KEY" \
  -d '{
    "name": "Hourly ping",
    "endpointUrl": "https://yourapp.com/healthz",
    "cronExpression": "0 * * * *",
    "httpMethod": "GET"
  }'
```

Your endpoint gets called on schedule. Executions are logged (status code, latency, response body) for 30 days.

**Implementation notes:**

- Scheduler runs every minute, queries jobs where `nextRunAt <= now()`, fires them in parallel, updates `nextRunAt`
- Rate limiting per API key (sliding window, Redis-backed)
- Per-request logging for debugging
- PostgreSQL for persistence, node-cron for the tick

**What I'd do differently:** Move the scheduler to a proper job queue (BullMQ) instead of DB polling for scale — the current approach works but doesn't distribute well past a single instance.

MIT licensed, self-hostable: https://github.com/iuribpmoro/cronapi
Live: https://api.cronapi.dev
