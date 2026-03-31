# Use Case: Database Maintenance

Automate routine database cleanup, archiving, and backup tasks on a reliable schedule.

---

## Overview

Databases accumulate stale data over time — expired sessions, old logs, soft-deleted records, orphaned rows. Running these cleanup tasks manually is error-prone and easy to forget. With CronAPI, you schedule a maintenance endpoint and let it run automatically.

**Common examples:**
- Delete expired sessions and tokens nightly
- Archive orders older than 90 days to a cold-storage table
- Purge soft-deleted records after a retention period
- Trigger a PostgreSQL `VACUUM ANALYZE` on low-traffic hours
- Export a daily database snapshot to S3

---

## Architecture

```
CronAPI scheduler
    │
    │  POST /api/internal/maintenance/db-cleanup
    ▼
Your app endpoint
    │
    ├── Runs DELETE / UPDATE / INSERT ... SELECT
    ├── Returns rows affected
    └── Logs result for observability
```

---

## Step 1 — Build the Maintenance Endpoint

```javascript
// POST /api/internal/maintenance/db-cleanup
import crypto from 'crypto';
import { db } from '../db';

export async function dbCleanupHandler(req, res) {
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

  const results = {};

  // 1. Delete expired sessions (older than 24 hours)
  const sessions = await db.query(
    `DELETE FROM sessions WHERE expires_at < NOW() - INTERVAL '24 hours'`
  );
  results.expiredSessions = sessions.rowCount;

  // 2. Delete soft-deleted records past retention window (30 days)
  const softDeleted = await db.query(
    `DELETE FROM users
     WHERE deleted_at IS NOT NULL
       AND deleted_at < NOW() - INTERVAL '30 days'`
  );
  results.purgedUsers = softDeleted.rowCount;

  // 3. Archive old orders to archive table
  const archived = await db.query(
    `INSERT INTO orders_archive
     SELECT * FROM orders
     WHERE created_at < NOW() - INTERVAL '90 days'
       AND archived = false;

     UPDATE orders SET archived = true
     WHERE created_at < NOW() - INTERVAL '90 days'
       AND archived = false`
  );
  results.archivedOrders = archived.rowCount;

  // 4. Trim old job execution logs (keep 30 days)
  const logs = await db.query(
    `DELETE FROM job_logs WHERE created_at < NOW() - INTERVAL '30 days'`
  );
  results.prunedLogs = logs.rowCount;

  console.log('DB maintenance complete', results);
  res.json({ ok: true, ...results });
}
```

---

## Step 2 — Register the CronAPI Job

**Nightly cleanup at 2 AM UTC (low-traffic window):**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Nightly DB cleanup",
    "endpointUrl": "https://yourapp.com/api/internal/maintenance/db-cleanup",
    "cronExpression": "0 2 * * *",
    "httpMethod": "POST",
    "timeoutMs": 120000,
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

**Weekly VACUUM on Sundays at 3 AM UTC:**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Weekly VACUUM ANALYZE",
    "endpointUrl": "https://yourapp.com/api/internal/maintenance/vacuum",
    "cronExpression": "0 3 * * 0",
    "httpMethod": "POST",
    "timeoutMs": 120000,
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

---

## Step 3 — Database Backups via S3

For backup triggers, your endpoint can invoke a pg_dump subprocess or use a managed backup API:

```javascript
// POST /api/internal/maintenance/backup
import { exec } from 'child_process';
import { promisify } from 'util';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { createReadStream } from 'fs';

const execAsync = promisify(exec);

export async function dbBackupHandler(req, res) {
  // ... verify signature (same pattern as above) ...

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `/tmp/backup-${timestamp}.sql`;

  // Dump the database
  await execAsync(`pg_dump $DATABASE_URL -f ${filename} --no-password`);

  // Upload to S3
  const s3 = new S3Client({ region: process.env.AWS_REGION });
  await s3.send(new PutObjectCommand({
    Bucket: process.env.BACKUP_BUCKET,
    Key: `backups/db/${filename.split('/').pop()}`,
    Body: createReadStream(filename),
  }));

  res.json({ ok: true, backup: filename });
}
```

Register to run daily at 1 AM:

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily database backup",
    "endpointUrl": "https://yourapp.com/api/internal/maintenance/backup",
    "cronExpression": "0 1 * * *",
    "httpMethod": "POST",
    "timeoutMs": 120000,
    "maxRetries": 1,
    "notifyUrl": "https://yourapp.com/alerts/cronapi-failure"
  }'
```

---

## Tips

**Run in low-traffic windows** — Schedule heavy DELETE/UPDATE operations during off-peak hours (2–4 AM UTC for most US/EU apps) to avoid locking tables during peak load.

**Use batch deletes for large tables** — Deleting millions of rows in one query can lock your table for seconds. Process in batches:

```javascript
let deleted = 0;
let batch;
do {
  const result = await db.query(
    `DELETE FROM sessions
     WHERE id IN (
       SELECT id FROM sessions
       WHERE expires_at < NOW() - INTERVAL '24 hours'
       LIMIT 1000
     )`
  );
  batch = result.rowCount;
  deleted += batch;
} while (batch > 0);
```

**Respond before timing out** — If your maintenance task might exceed 30 seconds, set `"timeoutMs": 120000` (maximum 120s) or respond `200 OK` immediately and process asynchronously.

**Log results** — Return affected row counts in your response body. CronAPI stores the last execution's response body for 30 days, giving you an audit trail.

---

## Related Guides

- [Quick Start](../guides/quickstart.md)
- [Webhook Verification](../guides/webhook-verification.md)
- [Monitoring & Alerting](../guides/monitoring-alerting.md)
