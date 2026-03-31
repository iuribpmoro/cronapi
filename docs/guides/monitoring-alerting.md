# Monitoring & Alerting

Get notified when a scheduled job fails and monitor job health over time.

---

## Failure Notifications via `notifyUrl`

Every CronAPI job supports a `notifyUrl` field. When a job execution fails (non-2xx response or timeout after all retries), CronAPI sends a `POST` request to that URL with a JSON payload describing the failure.

### Setting a Notification URL

When creating a job:

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily report",
    "endpointUrl": "https://yourapp.com/tasks/report",
    "cronExpression": "0 8 * * *",
    "httpMethod": "POST",
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

Or add it to an existing job:

```bash
curl -X PATCH https://api.cronapi.dev/api/v1/jobs/job_uuid \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"notifyUrl": "https://yourapp.com/alerts/cronapi-failure"}'
```

### Notification Payload

CronAPI sends a `POST` to your `notifyUrl` with this body:

```json
{
  "jobId": "job_uuid",
  "jobName": "Daily report",
  "executionId": "exec_uuid",
  "failedAt": "2024-06-01T08:00:04.000Z",
  "statusCode": 500,
  "error": "Request timed out after 30000ms"
}
```

---

## Retry Behavior

CronAPI retries failed requests automatically. The `maxRetries` field (default `3`, max `5`) controls how many times a job is retried before the failure notification is sent.

```bash
curl -X PATCH https://api.cronapi.dev/api/v1/jobs/job_uuid \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"maxRetries": 5}'
```

Set `maxRetries: 0` to disable retries and get notified immediately on the first failure.

---

## Routing Failure Alerts

### Slack

Create a Slack incoming webhook and use it as the `notifyUrl` directly — CronAPI's notification payload is plain JSON that Slack will accept.

Alternatively, create a lightweight relay endpoint that reformats the payload into a Slack message:

```javascript
// Express handler — relay CronAPI failure to Slack
app.post('/alerts/cronapi-failure', express.json(), async (req, res) => {
  const { jobName, failedAt, statusCode, error } = req.body;

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text: `*CronAPI job failed*: ${jobName}`,
      attachments: [
        {
          color: 'danger',
          fields: [
            { title: 'Status', value: String(statusCode), short: true },
            { title: 'Failed at', value: failedAt, short: true },
            { title: 'Error', value: error ?? 'None' },
          ],
        },
      ],
    }),
  });

  res.json({ ok: true });
});
```

### PagerDuty / Opsgenie

Use a relay endpoint to translate the CronAPI failure payload into a PagerDuty Events API v2 call:

```javascript
app.post('/alerts/cronapi-failure', express.json(), async (req, res) => {
  const { jobId, jobName, failedAt, statusCode, error } = req.body;

  await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Token token=${process.env.PAGERDUTY_ROUTING_KEY}`,
    },
    body: JSON.stringify({
      routing_key: process.env.PAGERDUTY_ROUTING_KEY,
      event_action: 'trigger',
      dedup_key: `cronapi-${jobId}`,
      payload: {
        summary: `CronAPI job "${jobName}" failed (HTTP ${statusCode})`,
        severity: 'error',
        source: 'cronapi',
        timestamp: failedAt,
        custom_details: { error },
      },
    }),
  });

  res.json({ ok: true });
});
```

### Email (via Resend / SendGrid)

```javascript
app.post('/alerts/cronapi-failure', express.json(), async (req, res) => {
  const { jobName, failedAt, statusCode, error } = req.body;

  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: 'alerts@yourapp.com',
      to: 'oncall@yourapp.com',
      subject: `CronAPI: job "${jobName}" failed`,
      text: `Job: ${jobName}\nStatus: ${statusCode}\nFailed at: ${failedAt}\nError: ${error ?? 'none'}`,
    }),
  });

  res.json({ ok: true });
});
```

---

## Polling Execution History

For dashboards or periodic health checks, poll the executions endpoint:

```bash
curl "https://api.cronapi.dev/api/v1/jobs/job_uuid/executions?limit=10" \
  -H "Authorization: Bearer $CRONAPI_KEY"
```

Check for consecutive failures:

```javascript
const { executions } = await fetchExecutions(jobId, { limit: 5 });
const recentFailures = executions.filter((e) => e.statusCode < 200 || e.statusCode > 299);

if (recentFailures.length === executions.length) {
  // All 5 recent executions failed — alert!
}
```

---

## Disabling a Failing Job

If a job is causing cascading failures on your endpoint, disable it immediately:

```bash
curl -X PATCH https://api.cronapi.dev/api/v1/jobs/job_uuid \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": false}'
```

Re-enable when the underlying issue is fixed:

```bash
curl -X PATCH https://api.cronapi.dev/api/v1/jobs/job_uuid \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{"enabled": true}'
```

---

## Related Guides

- [Quick Start](./quickstart.md)
- [Webhook Verification](./webhook-verification.md) — verify `notifyUrl` requests are from CronAPI
