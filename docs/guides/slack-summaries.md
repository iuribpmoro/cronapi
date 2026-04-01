# Send Daily Slack Summaries with CronAPI

Schedule a daily digest to your Slack channel using CronAPI webhooks and Slack's Incoming Webhooks.

## Prerequisites

- A CronAPI account
- A Slack workspace where you can create apps
- A server endpoint that generates your summary data (or use CronAPI's HTTP job to call Slack directly)

## Step 1: Create a Slack Incoming Webhook

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and click **Create New App → From scratch**.
2. Name your app (e.g., "Daily Summary Bot") and pick your workspace.
3. Under **Add features and functionality**, select **Incoming Webhooks**.
4. Toggle **Activate Incoming Webhooks** on.
5. Click **Add New Webhook to Workspace**, choose your channel, and click **Allow**.
6. Copy the webhook URL — it looks like `https://hooks.slack.com/services/T.../B.../...`.

## Step 2: Create a CronAPI job that calls your summary endpoint

If you have a backend that compiles the summary:

```bash
curl -X POST https://api.cronapi.io/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Slack summary",
    "schedule": "0 9 * * 1-5",
    "type": "http",
    "config": {
      "url": "https://yourapp.com/internal/slack-summary",
      "method": "POST",
      "headers": { "X-Cron-Secret": "YOUR_SECRET" }
    }
  }'
```

`0 9 * * 1-5` fires at 09:00 Monday–Friday (UTC). Adjust timezone with the `timezone` field.

## Step 3: Post the summary to Slack

In your summary handler, build a Slack Block Kit message and POST it to the webhook:

```js
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;

async function sendDailySummary() {
  const stats = await getDailyStats(); // your data source

  const message = {
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `Daily Summary — ${new Date().toDateString()}` }
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Jobs run:*\n${stats.jobsRun}` },
          { type: "mrkdwn", text: `*Failures:*\n${stats.failures}` },
          { type: "mrkdwn", text: `*Avg duration:*\n${stats.avgDurationMs}ms` },
          { type: "mrkdwn", text: `*Uptime:*\n${stats.uptimePct}%` }
        ]
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "View dashboard" },
            url: "https://cronapi.io/dashboard"
          }
        ]
      }
    ]
  };

  await fetch(SLACK_WEBHOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message)
  });
}
```

## Step 4: Skip weekends or holidays (optional)

Add a quick guard inside your handler if CronAPI fires but you don't want to send:

```js
const today = new Date();
if (today.getDay() === 0 || today.getDay() === 6) return; // skip weekends
```

Or manage it in the cron expression itself: `0 9 * * 1-5`.

## Direct Slack post (no backend needed)

For simple cases you can post directly from CronAPI to the Slack webhook without your own server:

```bash
curl -X POST https://api.cronapi.io/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Morning standup reminder",
    "schedule": "0 9 * * 1-5",
    "type": "http",
    "config": {
      "url": "https://hooks.slack.com/services/YOUR/WEBHOOK/URL",
      "method": "POST",
      "body": { "text": "Good morning! Time for standup :wave:" }
    }
  }'
```

## Next steps

- [Automate database backups](./database-backups.md)
- [Build a social media scheduler](./social-media-scheduler.md)
