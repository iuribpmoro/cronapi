# CronAPI — Product Hunt Launch Draft

## Title
CronAPI

## Tagline
Cron jobs as an API. No infrastructure, no crontab, just HTTP.

## Description (500 chars max)
CronAPI lets you schedule HTTP endpoints on a cron schedule — no servers, no infrastructure, no crontab to manage.

Register, grab an API key, and POST a job in seconds. Your endpoint gets called on your schedule. Free tier includes 10 jobs (hourly minimum). Upgrade to run jobs every minute, up to unlimited.

Built for developers who want to trigger webhooks, run background tasks, or ping URLs on a schedule without babysitting infrastructure.

## Topics / Tags
- Developer Tools
- APIs
- Scheduling
- SaaS
- Productivity

---

## Gallery / Screenshots (suggestions)
1. Short code snippet showing registration + job creation (curl or JS)
2. Landing page screenshot
3. Pricing table (Free / Indie $9 / Pro $29)

---

## Maker First Comment (the comment you post as the maker after launch)

Hey Product Hunt! 👋

I built CronAPI because I kept running into the same friction: I need to call a URL on a schedule, and every solution requires setting up infrastructure I don't want to manage.

**The problem:** crontab requires a server; cloud schedulers (Lambda, Cloud Run jobs) require IAM, config, and deployment pipelines. It's overkill for "call this webhook every hour."

**What CronAPI does:**

1. Register with your email → get an API key (shown once, save it)
2. POST a job with a cron expression and a URL
3. CronAPI calls your endpoint on schedule — forever, no servers

```bash
# Register
curl -X POST https://cronapi.dev/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'

# Create a job (runs every hour)
curl -X POST https://cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hourly report",
    "endpointUrl": "https://yourapp.com/webhooks/report",
    "cronExpression": "0 * * * *",
    "httpMethod": "POST"
  }'
```

**Pricing:**
- Free: 10 jobs, hourly minimum — good for most hobby projects
- Indie ($9/mo): 100 jobs, every-minute scheduling
- Pro ($29/mo): unlimited jobs, every-minute scheduling

Happy to answer any questions. What would you add to this? 🚀
