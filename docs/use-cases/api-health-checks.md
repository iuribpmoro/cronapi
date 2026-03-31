# Use Case: API Health Checks

Monitor external API uptime and get alerted when a dependency goes down.

---

## Overview

Your application likely depends on external APIs — payment processors, email providers, data feeds, third-party SaaS. When those APIs go down, your app breaks — often silently. CronAPI lets you schedule a health-check endpoint that pings your dependencies and alerts you before your users notice.

**Common examples:**
- Ping your own public API every 5 minutes and alert on failure
- Check that a payment provider's API is responding before market open
- Verify a data-feed endpoint returns fresh data hourly
- Monitor that a third-party OAuth endpoint is reachable

---

## Architecture

```
CronAPI scheduler (every 5 min)
    │
    │  POST /api/internal/health/check-dependencies
    ▼
Your health-check endpoint
    │
    ├── Pings external APIs
    ├── Checks response time and status
    ├── Stores results for dashboards
    └── Triggers alerts on failure
```

---

## Step 1 — Build the Health Check Endpoint

```javascript
// POST /api/internal/health/check-dependencies
import crypto from 'crypto';
import fetch from 'node-fetch';

const DEPS = [
  {
    name: 'Stripe',
    url: 'https://status.stripe.com/api/v2/status.json',
    method: 'GET',
    expectStatus: 200,
    // Returns { status: { indicator: 'none' } } when healthy
    validate: (body) => body?.status?.indicator === 'none',
  },
  {
    name: 'SendGrid',
    url: 'https://status.sendgrid.com/api/v2/status.json',
    method: 'GET',
    expectStatus: 200,
    validate: (body) => body?.status?.indicator === 'none',
  },
  {
    name: 'Own API',
    url: 'https://yourapp.com/health',
    method: 'GET',
    expectStatus: 200,
    validate: (body) => body?.status === 'ok',
  },
];

export async function healthCheckHandler(req, res) {
  // Verify the request came from CronAPI
  const secret = process.env.CRONAPI_SIGNING_SECRET;
  const signature = req.headers['x-cronapi-signature'] ?? '';
  const rawBody = req.rawBody;

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = await Promise.allSettled(
    DEPS.map(async (dep) => {
      const start = Date.now();
      try {
        const response = await fetch(dep.url, {
          method: dep.method,
          signal: AbortSignal.timeout(10_000), // 10s timeout per dep
        });
        const latencyMs = Date.now() - start;
        const body = await response.json().catch(() => null);

        const healthy =
          response.status === dep.expectStatus &&
          (dep.validate ? dep.validate(body) : true);

        return {
          name: dep.name,
          healthy,
          statusCode: response.status,
          latencyMs,
        };
      } catch (err) {
        return {
          name: dep.name,
          healthy: false,
          error: err.message,
          latencyMs: Date.now() - start,
        };
      }
    })
  );

  const checks = results.map((r) => r.value ?? r.reason);
  const allHealthy = checks.every((c) => c.healthy);

  if (!allHealthy) {
    const failed = checks.filter((c) => !c.healthy).map((c) => c.name);
    console.error('Health check failures:', failed);
    // Optionally send an immediate alert here
  }

  // Return 200 always so CronAPI doesn't retry — we handle alerting ourselves
  res.json({ ok: true, allHealthy, checks });
}
```

> **Why return 200 even on failure?** If you return a 5xx, CronAPI will retry up to `maxRetries` times. For health checks, retries are usually unnecessary — return 200 and handle alerting in your own logic, or set `"maxRetries": 0`.

---

## Step 2 — Register the CronAPI Job

**Every 5 minutes (requires Indie or Pro plan):**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "API dependency health check",
    "endpointUrl": "https://yourapp.com/api/internal/health/check-dependencies",
    "cronExpression": "*/5 * * * *",
    "httpMethod": "POST",
    "maxRetries": 0,
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

**Every hour (free plan):**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hourly API health check",
    "endpointUrl": "https://yourapp.com/api/internal/health/check-dependencies",
    "cronExpression": "0 * * * *",
    "httpMethod": "POST",
    "maxRetries": 0
  }'
```

---

## Step 3 — Alert on Failure

Extend the handler to send a Slack alert when a dependency is unhealthy:

```javascript
if (!allHealthy) {
  const failed = checks.filter((c) => !c.healthy);
  const lines = failed.map(
    (c) => `• *${c.name}*: ${c.error ?? `HTTP ${c.statusCode}`} (${c.latencyMs}ms)`
  );

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `:red_circle: *API health check failed*\n${lines.join('\n')}`,
    }),
  });
}
```

---

## Step 4 — Store Results for a Status Dashboard

Write check results to your database for historical uptime tracking:

```javascript
// After running checks, persist each result
for (const check of checks) {
  await db.query(
    `INSERT INTO health_check_results (name, healthy, status_code, latency_ms, checked_at)
     VALUES ($1, $2, $3, $4, NOW())`,
    [check.name, check.healthy, check.statusCode ?? null, check.latencyMs]
  );
}

// Optional: prune results older than 30 days
await db.query(
  `DELETE FROM health_check_results WHERE checked_at < NOW() - INTERVAL '30 days'`
);
```

Query for uptime percentage:

```sql
SELECT
  name,
  COUNT(*) AS total_checks,
  SUM(CASE WHEN healthy THEN 1 ELSE 0 END) AS healthy_checks,
  ROUND(100.0 * SUM(CASE WHEN healthy THEN 1 ELSE 0 END) / COUNT(*), 2) AS uptime_pct,
  AVG(latency_ms) AS avg_latency_ms
FROM health_check_results
WHERE checked_at > NOW() - INTERVAL '7 days'
GROUP BY name;
```

---

## Tips

**Set per-dependency timeouts** — Use `AbortSignal.timeout()` (Node.js 18+) or `axios` timeout to avoid one slow dependency blocking all others.

**Check interval vs. plan** — The free plan supports hourly checks. For 5-minute checks, upgrade to Indie ($9/mo). For 1-minute checks, Indie or Pro.

**Avoid cascading alerts** — Add deduplication so you only alert once per incident, not once per check interval. Track `last_alerted_at` per dependency and skip sending if you alerted within the last N minutes.

---

## Related Guides

- [Quick Start](../guides/quickstart.md)
- [Monitoring & Alerting](../guides/monitoring-alerting.md)
- [Webhook Verification](../guides/webhook-verification.md)
