# Automate Daily Reports with CronAPI

**Audience:** Indie developers, agency devs, internal tool builders
**Use case:** Trigger a report-generation endpoint every morning at a fixed time

---

## The problem

You're building a SaaS, internal tool, or client dashboard. Every day at 8am, you need to:
- Email users their daily digest
- Generate a PDF report and upload it to S3
- Sync data to a spreadsheet
- Run a data aggregation job

The naive approach is a server running crontab. The cloud approach is Lambda + EventBridge — which takes an afternoon to wire up, needs IAM, and you'll forget what the config means in 3 months.

CronAPI gives you a webhook endpoint that runs on a schedule. Your logic stays in your app. CronAPI just calls it.

---

## What we'll build

A daily report automation that:
1. Fires at 8am UTC on weekdays
2. Hits your `/reports/generate` endpoint
3. Your endpoint does the heavy lifting (query DB, send emails, etc.)
4. Execution is logged with full response history

---

## Step 1: Build your report endpoint

Your endpoint is where the logic lives. CronAPI just calls it. Here are examples:

**Node.js / Express — Daily email digest:**
```js
app.post('/reports/daily-digest', async (req, res) => {
  // Optional: verify CronAPI HMAC signature
  // const sig = req.headers['x-cronapi-signature'];
  // verifySignature(sig, req.body, process.env.CRONAPI_SECRET);

  const users = await db.users.findAll({ where: { dailyDigest: true } });

  for (const user of users) {
    const stats = await getUserStats(user.id, 'yesterday');
    await sendEmail({
      to: user.email,
      subject: `Your daily summary — ${formatDate(new Date())}`,
      html: renderDigestTemplate(stats)
    });
  }

  res.json({ sent: users.length });
});
```

**Python / FastAPI — Generate and upload a PDF:**
```python
@app.post("/reports/weekly-pdf")
async def generate_weekly_pdf():
    data = await fetch_report_data()
    pdf_bytes = render_pdf(data)

    key = f"reports/weekly-{date.today()}.pdf"
    s3.put_object(Bucket="my-bucket", Key=key, Body=pdf_bytes)

    return {"url": f"https://my-bucket.s3.amazonaws.com/{key}"}
```

**Next.js — Data sync to Google Sheets:**
```js
// app/api/reports/sync/route.js
export async function POST(request) {
  const rows = await db.query(`
    SELECT date, revenue, signups, churn
    FROM daily_metrics
    WHERE date = CURRENT_DATE - 1
  `);

  await appendToSheet(process.env.SHEET_ID, rows);

  return Response.json({ synced: rows.length });
}
```

---

## Step 2: Secure your endpoint

You don't want anyone triggering your report endpoint with a random POST. CronAPI supports HMAC-SHA256 request signing.

When you create a job, you can set a secret. CronAPI will sign every request:

```
X-CronAPI-Signature: sha256=<hex-digest>
```

Verify it in your endpoint:

```js
const crypto = require('crypto');

function verifyCronAPISignature(req) {
  const signature = req.headers['x-cronapi-signature'];
  const secret = process.env.CRONAPI_SECRET;
  const body = JSON.stringify(req.body); // or raw body string

  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

Alternatively, send a custom header with a static secret you control:

```json
{
  "headers": {
    "x-cron-secret": "your-static-secret-here"
  }
}
```

---

## Step 3: Create the CronAPI job

**Weekday mornings at 8am UTC:**
```bash
curl -X POST https://cronapi.hakinsight.com/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily digest — 8am weekdays",
    "endpointUrl": "https://myapp.com/reports/daily-digest",
    "cronExpression": "0 8 * * 1-5",
    "httpMethod": "POST",
    "headers": { "x-cron-secret": "my-secret" },
    "body": "{\"trigger\": \"cronapi\"}"
  }'
```

**Every day at midnight (data aggregation):**
```bash
curl -X POST https://cronapi.hakinsight.com/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nightly aggregation",
    "endpointUrl": "https://myapp.com/jobs/aggregate",
    "cronExpression": "0 0 * * *",
    "httpMethod": "POST"
  }'
```

**Monday mornings at 9am (weekly PDF):**
```bash
# cronExpression: "0 9 * * 1"
```

---

## Step 4: Handle slow reports gracefully

Report generation can be slow. CronAPI waits for your response, but you shouldn't block the HTTP response on a slow operation.

**Pattern: respond immediately, process in background:**
```js
app.post('/reports/weekly-pdf', async (req, res) => {
  // Respond immediately so CronAPI logs a 200
  res.json({ status: 'queued' });

  // Do the slow work after responding
  setImmediate(async () => {
    await generateAndUploadPDF();
  });
});
```

Or use a job queue (Bull, BullMQ, Inngest):
```js
app.post('/reports/weekly-pdf', async (req, res) => {
  await reportQueue.add('generate', { date: new Date() });
  res.json({ status: 'queued' });
});
```

---

## Cron expression reference

| Schedule | Expression |
|---------|-----------|
| Every minute | `* * * * *` |
| Every hour | `0 * * * *` |
| Daily at 8am | `0 8 * * *` |
| Weekdays at 8am | `0 8 * * 1-5` |
| Every Monday 9am | `0 9 * * 1` |
| 1st of month at midnight | `0 0 1 * *` |
| Every 15 minutes | `*/15 * * * *` |

---

## Summary

CronAPI is the trigger layer. Your app contains the logic. This separation is clean:

- You can test your report endpoint independently with a simple `curl`
- CronAPI gives you an execution log: exactly when it ran, what your endpoint returned
- No Lambda, no EventBridge, no IAM roles
- Works with any HTTP endpoint — your framework doesn't matter

**Total setup time:** ~10 minutes, including writing your endpoint.
