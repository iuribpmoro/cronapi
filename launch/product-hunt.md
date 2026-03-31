# Product Hunt Launch

## Tagline (60 chars max)

Schedule HTTP calls without managing cron infrastructure

---

## Description (260 chars)

CronAPI lets developers schedule HTTP webhooks with a simple REST API. Set a cron expression, point it at your endpoint, and we fire it on schedule — no servers, no crontabs, no ops overhead. Free plan includes 10 jobs.

---

## Maker Comment

Hey PH! I built CronAPI because I kept solving the same problem in every project: I need to call an endpoint on a schedule.

The usual paths are painful:
- Spin up a VPS just to run cron — suddenly you're managing a server for a 3-line crontab
- Use a cloud scheduler (AWS EventBridge, GCP Cloud Scheduler) — vendor lock-in, IAM hell, and $0.10/job/month adds up
- Hack together a Node.js setInterval — dies when your dyno restarts

CronAPI is a single REST API. Register, get a key, POST a job with a cron expression + URL, done. Your endpoint gets called on schedule. Execution history stored for 30 days so you can debug failures.

The free tier is genuinely free — 10 jobs, hourly minimum interval. The Indie plan ($9/mo) gets you 100 jobs with per-minute granularity. Pro ($29/mo) is unlimited.

It's open-source if you want to self-host: [URL]

Happy to answer questions below!

---

## Feature Highlights

1. **Simple REST API** — register, get a key, create a job in one curl command
2. **Any HTTP method** — GET, POST, PUT, DELETE with custom headers and body
3. **Full execution history** — 30-day log of every run with status codes and response times
4. **Per-minute scheduling** — standard cron expressions down to 1-minute intervals (Indie+)
5. **Open-source & self-hostable** — MIT license, Docker + Railway deploy in minutes

---

## Pricing Summary

| Plan | Price | Jobs | Interval |
|------|-------|------|----------|
| Free | $0/mo | 10 | Hourly |
| Indie | $9/mo | 100 | Per-minute |
| Pro | $29/mo | Unlimited | Per-minute |

---

## Links

- Live API: [URL]
- GitHub: https://github.com/iuribpmoro/cronapi
- Docs: [URL]/docs
