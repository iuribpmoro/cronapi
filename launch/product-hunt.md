# CronAPI — Product Hunt Launch

## Title
CronAPI

## Tagline (60 chars max)
Cron jobs as an API. No infrastructure, no crontab.

## Description (260 chars)
Schedule any HTTP endpoint on a cron expression — no servers, no infrastructure. Register, grab an API key, POST a job. Your endpoint gets called on schedule. Free tier: 10 jobs. Upgrade for per-minute scheduling and unlimited jobs.

## Topics / Tags
- Developer Tools
- APIs
- Scheduling
- SaaS
- Productivity

## Feature Highlights
1. **API-first job scheduling** — create, update, pause, or delete cron jobs with a single HTTP request
2. **Zero infrastructure** — no servers, no crontab, no IAM policies; just register and POST
3. **Execution history** — track every run with timestamps, response codes, and results (up to 30 days)
4. **Custom headers & bodies** — pass secrets, authentication tokens, or structured payloads to your endpoints
5. **Per-minute scheduling** — run jobs as frequently as every minute on paid plans

## Pricing Summary
| Plan | Price | Jobs | Min Interval |
|------|-------|------|-------------|
| Free | $0/mo | 10 | 1 hour |
| Indie | $9/mo | 100 | 1 minute |
| Pro | $29/mo | Unlimited | 1 minute |

---

## Maker First Comment

Hey Product Hunt! 👋

I built CronAPI because I kept running into the same friction: I need to call a URL on a schedule, and every solution requires setting up infrastructure I don't want to manage.

**The problem:** crontab requires a server; cloud schedulers (Lambda, Cloud Run jobs) require IAM, config, and deployment pipelines. It's overkill for "call this webhook every hour."

**What CronAPI does:**

1. Register with your email → get an API key (shown once, save it)
2. POST a job with a cron expression and a URL
3. CronAPI calls your endpoint on schedule — forever, no servers

```bash
# Register
curl -X POST [URL]/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'

# Create a job (runs every hour)
curl -X POST [URL]/api/v1/jobs \
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

→ [URL]
