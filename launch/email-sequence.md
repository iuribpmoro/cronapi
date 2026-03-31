# CronAPI — Email Onboarding Sequence

Four emails. Triggered by signup event. Plain-text style, technical tone.

---

## Email 1: Welcome (send immediately after signup)

**Subject:** Your CronAPI API key

**Body:**

```
Hi,

Your API key is ready:

  cron_live_xxxxxxxxxxxx

Save it — it's shown only once. If you lose it, you can generate a new one from the dashboard.

Quick start:

  curl -X POST https://api.cronapi.dev/api/v1/jobs \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "My first job",
      "endpointUrl": "https://yourapp.com/tasks/run",
      "cronExpression": "0 * * * *",
      "httpMethod": "POST"
    }'

That's it. Your endpoint will be called every hour.

Free plan limits: 10 jobs, minimum 1-hour interval. Upgrade to Indie ($9/mo) for 100 jobs and per-minute scheduling.

—
CronAPI
https://api.cronapi.dev
```

---

## Email 2: Getting Started (send 24 hours after signup)

**Subject:** How to create your first job and test it

**Body:**

```
Hi,

If you haven't set up your first job yet, here's the 5-minute path.

---

Step 1: Create a job

  curl -X POST https://api.cronapi.dev/api/v1/jobs \
    -H "Authorization: Bearer YOUR_API_KEY" \
    -H "Content-Type: application/json" \
    -d '{
      "name": "Hourly sync",
      "endpointUrl": "https://yourapp.com/sync",
      "cronExpression": "0 * * * *",
      "httpMethod": "POST",
      "headers": {"X-Secret": "your-secret-here"},
      "body": "{\"source\": \"cronapi\"}"
    }'

You'll get back a jobId. Save it.

---

Step 2: Test your endpoint

CronAPI waits for your cron schedule. If you want to test immediately, use a
service like https://webhook.site to catch test requests, or just watch your
application logs after the next scheduled run.

---

Step 3: Check execution history

  curl https://api.cronapi.dev/api/v1/jobs/YOUR_JOB_ID/executions \
    -H "Authorization: Bearer YOUR_API_KEY"

You'll see timestamps, HTTP status codes, and response bodies (truncated to 1kb).

---

If your endpoint needs to verify that requests are coming from CronAPI, we sign
every outgoing request with an HMAC-SHA256 signature in the X-CronAPI-Signature
header. You can verify it with your API key as the secret.

Any questions? Reply to this email.

—
CronAPI
```

---

## Email 3: Tips & Best Practices (send 3 days after signup)

**Subject:** Retry config, monitoring, and a few things worth knowing

**Body:**

```
Hi,

Three things that make CronAPI more reliable in production:

---

1. Retries

By default, failed requests (non-2xx or timeout) are not retried. If your
endpoint needs retry logic, set it when creating the job:

  "retryOnFailure": true,
  "maxRetries": 3

Retries use exponential backoff. If all retries fail, the execution is marked
as failed in your history.

---

2. Idempotency

Retries mean your endpoint may be called more than once for a single scheduled
run. Design your handlers to be idempotent — use a job ID or execution ID as a
deduplication key if needed.

The X-CronAPI-Job-Id and X-CronAPI-Execution-Id headers are included on every
request. Use them.

---

3. Monitoring via the dashboard

Visit https://api.cronapi.dev/dashboard to see:
- All active jobs and their next scheduled run
- Execution history with status codes and response times
- Jobs that have been failing consistently (flagged in the UI)

If a job fails 3 times in a row, it's automatically paused and you'll see it
marked in the dashboard. Re-enable it once you've fixed the underlying issue.

---

One more thing: the /status endpoint gives you a public summary you can link
from your own status page:

  curl https://api.cronapi.dev/status

—
CronAPI
```

---

## Email 4: Upgrade Nudge (send 7 days after signup)

**Subject:** How much of your free tier are you using?

**Body:**

```
Hi,

A quick check-in. You've been on CronAPI for a week.

---

Free plan limits:
- 10 jobs
- 1-hour minimum interval

If you're hitting either of those limits (or getting close), Indie is $9/mo:
- 100 jobs
- Per-minute scheduling
- Priority support

Pro is $29/mo if you need more:
- Unlimited jobs
- Per-minute scheduling

Upgrade here: https://api.cronapi.dev/dashboard/upgrade

---

Most common reason people upgrade: they want per-minute scheduling. If you're
running jobs that need to fire more often than once an hour — health checks,
data syncs, queue flushes — that's the one to get.

If the free plan is working fine for you, no pressure. It's free forever.

Reply if you have questions or hit any issues.

—
CronAPI
```

---

## Sending Notes

- Use plain-text or minimal HTML. This audience is developers — they don't want marketing emails.
- From address: `hello@cronapi.dev` or `noreply@cronapi.dev`
- From name: `CronAPI`
- Unsubscribe: include a plain unsubscribe link in the footer (required legally, and the right thing to do).
- Personalization: replace `Hi,` with `Hi {first_name},` if name is collected at signup.
- Trigger: all four emails are triggered from the signup event, with delays: 0h, 24h, 72h, 168h.
