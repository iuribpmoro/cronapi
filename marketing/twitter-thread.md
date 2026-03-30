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
curl -X POST https://cronapi.dev/api/v1/jobs \
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

**Tweet 4 (pricing / free tier)**
Free tier: 10 jobs, hourly minimum.

Indie ($9/mo): 100 jobs, every-minute scheduling.
Pro ($29/mo): unlimited jobs, every-minute scheduling.

Start free, upgrade when you grow.

→ https://cronapi.dev

---

**Tweet 5 (CTA)**
Would love your feedback. Drop a reply or DM — especially if you've hit the "cron job on a budget" problem before.

RT if you know a dev who's fought with crontab more times than they'd like to admit 🙂

#buildinpublic #SaaS #devtools #API #serverless
