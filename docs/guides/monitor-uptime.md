# Monitor Any Website Uptime in 2 Minutes

Use CronAPI to poll your endpoints on a schedule and get alerted instantly when they go down.

## Prerequisites

- A CronAPI account (free tier works)
- The URL you want to monitor
- A webhook or email to receive alerts

## Step 1: Create the monitoring job

```bash
curl -X POST https://api.cronapi.io/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monitor my website",
    "schedule": "*/5 * * * *",
    "type": "http",
    "config": {
      "url": "https://yoursite.com/health",
      "method": "GET",
      "timeout": 10,
      "expectedStatus": 200
    }
  }'
```

This job runs every 5 minutes and expects a `200 OK` response.

## Step 2: Add a failure webhook

Configure CronAPI to call your webhook when the job fails:

```bash
curl -X PATCH https://api.cronapi.io/v1/jobs/JOB_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "notifications": {
      "onFailure": {
        "webhook": "https://yoursite.com/alerts/downtime"
      }
    }
  }'
```

## Step 3: Handle the alert in your app

Your webhook endpoint will receive a POST with job details:

```json
{
  "jobId": "abc123",
  "jobName": "Monitor my website",
  "status": "failed",
  "failedAt": "2024-01-15T10:30:00Z",
  "error": "Connection timeout after 10s",
  "url": "https://yoursite.com/health"
}
```

A minimal Express handler:

```js
app.post('/alerts/downtime', (req, res) => {
  const { jobName, error, failedAt } = req.body;
  console.error(`[DOWNTIME] ${jobName} failed at ${failedAt}: ${error}`);
  // send email, Slack message, PagerDuty alert, etc.
  res.sendStatus(200);
});
```

## Step 4: Verify it works

Temporarily point the monitored URL to a non-existent endpoint, wait up to 5 minutes, and confirm you receive the alert.

## Tips

- **Shorter intervals**: Change `*/5 * * * *` to `* * * * *` for 1-minute checks (Pro plan).
- **Multiple regions**: CronAPI can run checks from multiple geographic regions simultaneously.
- **Retry before alert**: Set `retries: 2` in the job config to avoid false positives from transient blips.
- **Status page**: Aggregate multiple monitor jobs to build a simple internal status page.

## Next steps

- [Send Slack summaries with CronAPI](./slack-summaries.md)
- [Automate database backups](./database-backups.md)
