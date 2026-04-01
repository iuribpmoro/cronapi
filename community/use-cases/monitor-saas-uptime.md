# How to Monitor Your SaaS Uptime with CronAPI

**Audience:** Indie developers, SaaS founders
**Use case:** Health check pings every minute, Slack alerts on failure

---

## The problem

Your app is live. Users are paying. But you don't always know when it goes down — you find out when a user tweets about it or a customer emails you.

You need uptime monitoring. But:
- Paid services (Pingdom, Better Uptime) cost $15–30/mo for something simple
- Rolling your own requires a separate server or Lambda function + IAM + CloudWatch
- Railway/Render cron jobs are tied to a single service

CronAPI solves this in under 5 minutes.

---

## What we'll build

A lightweight uptime monitor that:
1. Pings your app's `/health` endpoint every minute
2. Sends a Slack alert if it gets anything other than a 200
3. Logs every check in CronAPI's execution history

You'll need:
- A CronAPI account (free tier works)
- A `/health` endpoint on your app
- A Slack incoming webhook (optional — for alerts)

---

## Step 1: Add a `/health` endpoint to your app

Your health endpoint should return `200 OK` when things are working. It can be as simple as:

**Express.js:**
```js
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now() });
});
```

**Next.js (App Router):**
```js
// app/api/health/route.js
export async function GET() {
  return Response.json({ status: 'ok' });
}
```

**FastAPI (Python):**
```python
@app.get("/health")
def health():
    return {"status": "ok"}
```

If you want a deeper health check (database connectivity, cache, etc.):
```js
app.get('/health', async (req, res) => {
  try {
    await db.raw('SELECT 1'); // or your DB ping
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'degraded', error: err.message });
  }
});
```

---

## Step 2: Get your CronAPI key

```bash
curl -X POST https://cronapi.hakinsight.com/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

Save the returned API key — it's shown once.

---

## Step 3: Create the uptime monitor job

```bash
curl -X POST https://cronapi.hakinsight.com/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Uptime — myapp.com",
    "endpointUrl": "https://myapp.com/health",
    "cronExpression": "* * * * *",
    "httpMethod": "GET"
  }'
```

That's it. CronAPI will hit your endpoint every minute and log the result.

> **Free tier note:** The free tier supports hourly minimum scheduling. For per-minute pings, you'll need the Indie plan ($9/mo). For basic uptime checks on a side project, hourly (`0 * * * *`) is often enough.

---

## Step 4: View execution history

Every job run is logged in the CronAPI dashboard:
- HTTP status code returned
- Response body (first 1000 chars)
- Execution timestamp
- Duration

If your app goes down, you'll see `503` or a timeout in the history. You can see exactly when the outage started and when it recovered.

---

## Step 5: Add Slack alerts (optional)

CronAPI calls your endpoint and logs the result — but it doesn't send alerts yet (that's on the roadmap). For now, you can add a simple alert layer in your health endpoint:

```js
// Send a Slack alert if a critical check fails
app.get('/health', async (req, res) => {
  const dbOk = await checkDatabase();

  if (!dbOk) {
    // Fire-and-forget Slack webhook
    fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: '🔴 *CronAPI health check failed* — database unreachable',
        username: 'uptime-bot'
      })
    }).catch(() => {}); // don't block the response

    return res.status(503).json({ status: 'degraded', db: false });
  }

  res.json({ status: 'ok', db: true });
});
```

Now when CronAPI pings `/health` and the DB is down, Slack gets notified.

---

## What this gives you

| Feature | Value |
|---------|-------|
| Ping frequency | Every minute (Indie) or every hour (Free) |
| Execution history | Full log of every check with status codes |
| Zero infra | No server, no Lambda, no cron daemon |
| Cost | $0 (Free) or $9/mo (Indie) |

---

## Going further

- **Multiple endpoints:** Create separate CronAPI jobs for `/health`, `/api/v1/status`, and any critical user paths
- **HMAC verification:** Sign the CronAPI request so your health endpoint knows it's a legitimate ping, not probing
- **Synthetic transactions:** Instead of a simple ping, call an endpoint that runs a real user workflow (e.g., create a test record and delete it)

---

## Summary

1. Add `/health` to your app
2. Register at cronapi.hakinsight.com
3. POST a job with `"cronExpression": "* * * * *"` (or `"0 * * * *"` on free)
4. View history in the dashboard

That's uptime monitoring in 5 minutes, no credit card required.
