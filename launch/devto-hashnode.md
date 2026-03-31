# CronAPI — Dev.to / Hashnode Launch Blog Post

**Title:** I Built a Cron-as-a-Service API (and Why the Obvious Solutions Kept Failing Me)

**Tags:** webdev, opensource, javascript, node

---

Every web project I've shipped eventually needs something like this:

> "Send the weekly digest email every Monday at 8am."

Simple requirement. Annoyingly painful to implement correctly.

## The usual options (and why they kept falling short)

**1. crontab on a VPS**
Works fine until you're maintaining a server just to run a 3-line cron expression. Security patches, uptime monitoring, SSH access — all for a job that does one HTTP request per hour.

**2. Vercel / Railway built-in cron**
Convenient if your entire app lives on one platform, but it only triggers routes within that same deployment. Cross-service scheduling gets messy fast.

**3. AWS EventBridge or GCP Cloud Scheduler**
Powerful, but 20 minutes of IAM config before you can fire a single webhook. Vendor lock-in is real, and the cost model is opaque.

**4. `node-cron` inside your app**
The classic hack. Works until your process restarts, your dyno goes to sleep, or you scale to two instances and every job fires twice.

None of these felt like the right abstraction. What I actually wanted was: *a scheduled HTTP call as a managed resource*.

## Building CronAPI

I decided to build it. The idea: a REST API where a "cron job" is just a resource you create, update, and delete — like any other API entity.

### The interface

```bash
# 1. Register — get your API key
curl -X POST https://api.cronapi.dev/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'

# Response
{
  "apiKey": "cron_live_xxxxxxxxxxxx",
  "plan": "free"
}

# 2. Create a job
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer cron_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly digest",
    "endpointUrl": "https://yourapp.com/hooks/digest",
    "cronExpression": "0 8 * * 1",
    "httpMethod": "POST",
    "body": "{\"type\": \"weekly\"}"
  }'
```

That's it. Your endpoint gets called every Monday at 8am. No infrastructure to manage on your end.

### What happens under the hood

The scheduler is a node-cron tick that runs every minute. It queries PostgreSQL for jobs where `nextRunAt <= now()` and `status = 'active'`, fires the HTTP calls (respecting per-plan concurrency limits), stores the execution result (status code, latency, truncated response body), and schedules the next run.

Execution history is retained for 30 days — so when a job silently fails at 3am, you can inspect exactly what your endpoint returned.

```bash
# Check execution history
curl https://api.cronapi.dev/api/v1/jobs/{jobId}/executions \
  -H "Authorization: Bearer YOUR_KEY"
```

### The stack

- **Runtime:** Node.js 20 + TypeScript
- **Database:** PostgreSQL (jobs, executions, API keys)
- **Scheduler:** node-cron (1-minute tick)
- **HTTP:** Axios with configurable timeout + retry
- **Auth:** Bearer tokens with per-key rate limiting
- **Deploy:** Docker + Railway / Render

### What I'd do differently at scale

The current scheduler is single-instance DB polling. It works well for the current load, but it has two known limitations:

1. **No horizontal scale** — two scheduler instances would double-fire jobs. The fix is a distributed lock or a proper job queue (BullMQ, pg-boss).
2. **Polling overhead** — querying the DB every minute is fine up to tens of thousands of jobs; above that you'd want event-driven wake-ups.

I'm documenting this openly because honest trade-off communication matters more than marketing copy.

## The pricing model

| Plan | Price | Jobs | Min Interval |
|------|-------|------|--------------|
| Free | $0/mo | 10 | Every hour |
| Indie | $9/mo | 100 | Every minute |
| Pro | $29/mo | Unlimited | Every minute |

Free tier is genuinely free — no credit card, no trial expiry. The constraint is real (hourly minimum, 10 jobs) but usable for personal projects and side projects in early stages.

## Self-hosting

It's MIT licensed. If you'd rather run it yourself:

```bash
git clone https://github.com/iuribpmoro/cronapi
cd cronapi
cp .env.example .env
# edit .env with your DATABASE_URL
docker compose up
```

Or deploy to Railway with one click — there's a button in the README.

## Try it

- **Live API:** https://api.cronapi.dev
- **Docs (Swagger UI):** https://api.cronapi.dev/docs
- **GitHub:** https://github.com/iuribpmoro/cronapi

I'd genuinely love feedback — especially from anyone who's solved this problem differently. What am I missing? What would make this actually useful for your workflow?

---

*This is a solo project. If you find a bug or want a feature, open an issue — I read everything.*
