---
sequence: Day 0
trigger: Immediately on signup
subject: "Welcome to CronAPI — here's how to get started"
preview_text: "Your first cron job is 2 minutes away."
---

Hi {{first_name}},

Welcome to CronAPI. You just joined thousands of developers who use scheduled jobs to automate the repetitive work that would otherwise eat up their day.

Here's how to run your first job in under 2 minutes:

**1. Grab your API key**
It's waiting for you in your dashboard under **Settings → API Keys**.

**2. Create a job with one curl command**

```bash
curl -X POST https://api.cronapi.io/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My first job",
    "schedule": "* * * * *",
    "type": "http",
    "config": {
      "url": "https://httpbin.org/post",
      "method": "POST"
    }
  }'
```

**3. Watch it run**
Head to the **Jobs** tab in your dashboard and see your first execution fire within a minute.

That's it. No servers to configure, no cron daemons to babysit.

→ [Open your dashboard](https://cronapi.io/dashboard)

If you get stuck at any point, reply to this email — I read every message.

— The CronAPI team

---
*You received this because you signed up at cronapi.io. [Unsubscribe]({{unsubscribe_url}})*
