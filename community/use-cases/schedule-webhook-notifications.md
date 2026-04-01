# Schedule Webhook Notifications for Your Team with CronAPI

**Audience:** Dev teams, team leads, internal tooling owners
**Use case:** Scheduled Slack/Teams/Discord notifications, standup reminders, digest bots

---

## The problem

Your team needs regular automated messages:
- A daily Slack digest of open PRs at 9am
- A weekly summary of support tickets on Monday mornings
- An end-of-sprint reminder every other Friday
- A nightly alert if any metric is out of bounds

You could set these up with:
- A cloud function + EventBridge (15 minutes + IAM config)
- A bot service (Zapier/Make — monthly cost, limited control)
- A cron server (requires infra management)

With CronAPI: POST a job, done.

---

## Pattern: CronAPI as a scheduled webhook trigger

CronAPI calls your endpoint on schedule. Your endpoint sends the notification. This gives you full control over the message content — because your endpoint queries your actual data at trigger time.

```
CronAPI → [your endpoint] → Slack / Discord / Teams / Email
                ↓
         queries your DB
         for fresh data
```

---

## Example 1: Daily open PR digest to Slack

**The endpoint (Node.js):**
```js
app.post('/notifications/pr-digest', async (req, res) => {
  const prs = await github.pullRequests.list({
    owner: 'myorg',
    repo: 'myrepo',
    state: 'open'
  });

  if (prs.length === 0) {
    return res.json({ sent: false, reason: 'no open PRs' });
  }

  const text = [
    `*Open PRs — ${new Date().toDateString()}*`,
    ...prs.map(pr => `• <${pr.html_url}|${pr.title}> by @${pr.user.login}`)
  ].join('\n');

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });

  res.json({ sent: true, count: prs.length });
});
```

**The CronAPI job:**
```bash
curl -X POST https://cronapi.hakinsight.com/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "PR digest — 9am weekdays",
    "endpointUrl": "https://myapp.internal/notifications/pr-digest",
    "cronExpression": "0 9 * * 1-5",
    "httpMethod": "POST"
  }'
```

---

## Example 2: Weekly support ticket summary (Monday 8am)

```js
app.post('/notifications/support-summary', async (req, res) => {
  const [open, closed, avgResponseHours] = await Promise.all([
    tickets.count({ status: 'open' }),
    tickets.count({ status: 'closed', closedAt: { gte: lastWeek() } }),
    tickets.avgResponseTime()
  ]);

  await sendSlackMessage({
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'Weekly Support Summary' }
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Open tickets:*\n${open}` },
          { type: 'mrkdwn', text: `*Closed this week:*\n${closed}` },
          { type: 'mrkdwn', text: `*Avg response time:*\n${avgResponseHours}h` }
        ]
      }
    ]
  });

  res.json({ ok: true });
});
```

**CronAPI job:** `cronExpression: "0 8 * * 1"` (every Monday at 8am)

---

## Example 3: Nightly metric alert

This only sends a message if something is wrong — otherwise it's a silent green run.

```js
app.post('/alerts/nightly-check', async (req, res) => {
  const [errorRate, p99Latency] = await Promise.all([
    metrics.errorRate('last_hour'),
    metrics.p99Latency('last_hour')
  ]);

  const alerts = [];
  if (errorRate > 0.01) alerts.push(`🔴 Error rate: ${(errorRate * 100).toFixed(2)}%`);
  if (p99Latency > 2000) alerts.push(`🟡 p99 latency: ${p99Latency}ms`);

  if (alerts.length > 0) {
    await sendSlackMessage({
      channel: '#oncall',
      text: `*Nightly metric alert*\n${alerts.join('\n')}`
    });
  }

  res.json({ alertsSent: alerts.length });
});
```

**CronAPI job:** `cronExpression: "0 23 * * *"` (every night at 11pm)

---

## Example 4: Biweekly sprint reminder

```js
app.post('/notifications/sprint-reminder', async (req, res) => {
  // Check if today is a sprint end day
  // (or just set the cron to match your sprint cadence)
  await sendDiscordMessage({
    content: [
      '**Sprint ends today!** 🏁',
      'Please update your tickets before EOD.',
      '→ https://linear.app/myteam/my-issues'
    ].join('\n')
  });

  res.json({ sent: true });
});
```

**CronAPI job:** `cronExpression: "0 10 * * 5/2"` (every other Friday at 10am)

> Or use a specific date: `0 10 14 * *` (14th of each month)

---

## Example 5: Directly calling Slack (no middleware server)

If you just want to send a static message on a schedule — no dynamic data — you can call Slack's webhook URL directly from CronAPI.

```bash
curl -X POST https://cronapi.hakinsight.com/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Standup reminder",
    "endpointUrl": "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
    "cronExpression": "0 9 * * 1-5",
    "httpMethod": "POST",
    "headers": { "Content-Type": "application/json" },
    "body": "{\"text\": \"☕ Good morning! Standup in 15 minutes.\"}"
  }'
```

> No code required. CronAPI sends the Slack message directly.

---

## Managing multiple notification jobs

As your notification jobs grow, use the API to list and manage them:

```bash
# List all jobs
curl https://cronapi.hakinsight.com/api/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY"

# Pause a job (e.g., during company holiday)
curl -X PATCH https://cronapi.hakinsight.com/api/v1/jobs/JOB_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'

# Update the schedule
curl -X PATCH https://cronapi.hakinsight.com/api/v1/jobs/JOB_ID \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"cronExpression": "0 10 * * 1-5"}'
```

---

## Summary

| Notification | Schedule | Notes |
|-------------|---------|-------|
| Daily PR digest | `0 9 * * 1-5` | Weekdays only |
| Weekly support summary | `0 8 * * 1` | Monday mornings |
| Nightly metric alert | `0 23 * * *` | Silent if all green |
| Sprint reminder | `0 10 * * 5` | Adjust day to sprint cadence |
| Standup reminder (direct Slack) | `0 9 * * 1-5` | No server needed |

CronAPI is the glue between your schedule and your tools. Your notification logic stays in your codebase — where you can test it, version it, and iterate on it.
