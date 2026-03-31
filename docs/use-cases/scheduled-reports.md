# Use Case: Automated Scheduled Reports

Generate and deliver daily, weekly, or monthly reports automatically — without manual intervention.

---

## Overview

Scheduled reports are one of the most common automation needs for SaaS apps, internal tools, and data platforms. With CronAPI, you point a cron job at your report-generation endpoint and let it run on a defined schedule.

**Common examples:**
- Daily revenue summary emailed to the team at 8 AM
- Weekly active-user report sent to Slack every Monday morning
- Monthly invoice generation triggered on the 1st of the month
- End-of-day analytics digest for product stakeholders

---

## Architecture

```
CronAPI scheduler
    │
    │  POST /api/internal/reports/daily
    ▼
Your app endpoint
    │
    ├── Queries database for time-range data
    ├── Formats the report (HTML, PDF, CSV, etc.)
    └── Delivers via email / Slack / S3 / dashboard
```

---

## Step 1 — Build the Report Endpoint

Your endpoint performs the work. Here is a Node.js/Express example that generates a daily revenue summary and emails it:

```javascript
// POST /api/internal/reports/daily
import crypto from 'crypto';
import { db } from '../db';
import { sendEmail } from '../lib/email';

export async function dailyReportHandler(req, res) {
  // Verify the request came from CronAPI
  const secret = process.env.CRONAPI_SIGNING_SECRET;
  const signature = req.headers['x-cronapi-signature'] ?? '';
  const rawBody = req.rawBody; // requires raw body middleware

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Compute yesterday's date range
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);

  // Query data
  const { rows } = await db.query(
    `SELECT
       COUNT(*) AS orders,
       SUM(amount_cents) AS revenue_cents
     FROM orders
     WHERE created_at BETWEEN $1 AND $2
       AND status = 'completed'`,
    [start.toISOString(), end.toISOString()]
  );

  const { orders, revenue_cents } = rows[0];
  const revenue = (parseInt(revenue_cents) / 100).toFixed(2);

  // Deliver the report
  await sendEmail({
    to: process.env.REPORT_RECIPIENTS,
    subject: `Daily Revenue — ${start.toDateString()}`,
    text: `Orders: ${orders}\nRevenue: $${revenue}`,
  });

  res.json({ ok: true, orders, revenue });
}
```

---

## Step 2 — Register the CronAPI Job

**Daily report at 8 AM UTC:**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily revenue report",
    "endpointUrl": "https://yourapp.com/api/internal/reports/daily",
    "cronExpression": "0 8 * * *",
    "httpMethod": "POST",
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

**Weekly report every Monday at 9 AM UTC:**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly active users report",
    "endpointUrl": "https://yourapp.com/api/internal/reports/weekly",
    "cronExpression": "0 9 * * 1",
    "httpMethod": "POST",
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

**Monthly report on the 1st at midnight UTC:**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monthly invoice generation",
    "endpointUrl": "https://yourapp.com/api/internal/reports/monthly",
    "cronExpression": "0 0 1 * *",
    "httpMethod": "POST",
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

---

## Step 3 — Set the Signing Secret

Save the `signingSecret` from the job creation response:

```bash
# In your deployment environment
CRONAPI_SIGNING_SECRET=a3f8c2...
```

---

## Tips

**Idempotency** — Design your report endpoint to be safe to retry. CronAPI retries on failure. If your report-generation or delivery is not idempotent, add a deduplication check (e.g., store the last run date and skip if already generated for that date).

**Long-running reports** — If report generation takes more than 30 seconds, respond with `200 OK` immediately and process the work asynchronously (background job, queue). CronAPI's default timeout is 30 seconds; you can increase it up to 120 seconds with `"timeoutMs": 120000`.

**Time zones** — Cron expressions run in UTC. To deliver a report at 9 AM Eastern (UTC-5), use `0 14 * * *`.

---

## Related Guides

- [Quick Start](../guides/quickstart.md)
- [Webhook Verification](../guides/webhook-verification.md)
- [Monitoring & Alerting](../guides/monitoring-alerting.md)
