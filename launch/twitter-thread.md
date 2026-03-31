# CronAPI — Twitter/X Launch Thread

---

**Tweet 1 (hook)**
Cron jobs shouldn't require a server.

Introducing CronAPI — schedule any HTTP endpoint on a cron schedule. Register, get an API key, POST a job. Done.

No infrastructure. No crontab. No IAM policies.

👇 Here's how it works:

---

**Tweet 2 (how it works — code)**
Three steps:

1. Register → get your API key
2. POST a job with a URL + cron expression
3. We call your endpoint on schedule

```bash
curl -X POST [URL]/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily digest",
    "endpointUrl": "https://yourapp.com/hooks/digest",
    "cronExpression": "0 9 * * *",
    "httpMethod": "POST"
  }'
```

That's it. Your endpoint runs every day at 9am. ☕

---

**Tweet 3 (use cases)**
What can you do with it?

→ Trigger webhook-based workflows (Zapier, n8n, custom)
→ Run daily/weekly email digests
→ Ping a health-check URL on a schedule
→ Kick off background jobs in your SaaS
→ Warm up cold serverless functions

Anything you'd put in a crontab but don't want to manage infrastructure for.

---

**Tweet 4 (architecture / credibility)**
Under the hood:

→ PostgreSQL-backed scheduler (no in-memory state — restarts don't lose jobs)
→ Every run is logged: status code, response, timestamp
→ API keys are hashed at rest (bcrypt)
→ Rate limiting per key on the free tier

Simple and auditable. Built in TypeScript on Fastify.

---

**Tweet 5 (pricing)**
Pricing that doesn't punish side projects:

Free — 10 jobs, hourly minimum
Indie ($9/mo) — 100 jobs, every-minute scheduling
Pro ($29/mo) — unlimited jobs, every-minute scheduling

Start free. Upgrade when you need more.

→ [URL]

---

**Tweet 6 (CTA)**
Just launched. Would love your feedback.

What would make this actually useful for your workflow? What's missing?

Drop a reply or DM. 🙏

RT if you know a dev who's fought with crontab more times than they'd like to admit 😅

#buildinpublic #SaaS #devtools #API #serverless
