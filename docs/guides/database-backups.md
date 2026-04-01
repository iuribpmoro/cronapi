# Automate Database Backups with CronAPI

Run scheduled `pg_dump` (or `mysqldump`) backups and upload them to cloud storage — no cron daemon needed on your server.

## Prerequisites

- A CronAPI account
- A PostgreSQL (or MySQL) database
- An S3-compatible bucket (AWS S3, Cloudflare R2, Backblaze B2, etc.)
- A small server or Lambda to run the backup script (CronAPI triggers it)

## Architecture

```
CronAPI scheduler
      │  POST /run-backup
      ▼
Your backup endpoint
      │  pg_dump → gzip → upload
      ▼
S3 / R2 / B2 bucket
```

## Step 1: Write the backup script

```js
// backup.js  (Node.js, runs on your server or in a Lambda)
import { execSync } from "child_process";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createReadStream, unlinkSync } from "fs";

const s3 = new S3Client({ region: process.env.AWS_REGION });

export async function runBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.sql.gz`;
  const localPath = `/tmp/${filename}`;

  // Dump and compress
  execSync(
    `pg_dump "${process.env.DATABASE_URL}" | gzip > ${localPath}`
  );

  // Upload to S3
  await s3.send(new PutObjectCommand({
    Bucket: process.env.BACKUP_BUCKET,
    Key: `db-backups/${filename}`,
    Body: createReadStream(localPath),
    ContentType: "application/gzip",
    StorageClass: "STANDARD_IA" // cheaper for infrequently accessed backups
  }));

  unlinkSync(localPath); // clean up temp file
  console.log(`Backup uploaded: ${filename}`);
}
```

## Step 2: Expose a trigger endpoint

```js
// routes/backup.js
import express from "express";
import { runBackup } from "../backup.js";

const router = express.Router();

router.post("/run-backup", async (req, res) => {
  // Verify the request comes from CronAPI
  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  res.status(202).json({ message: "Backup started" }); // respond fast
  await runBackup(); // run async so CronAPI doesn't time out
});

export default router;
```

## Step 3: Schedule the backup in CronAPI

```bash
curl -X POST https://api.cronapi.io/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily database backup",
    "schedule": "0 2 * * *",
    "type": "http",
    "config": {
      "url": "https://yourapp.com/run-backup",
      "method": "POST",
      "headers": { "X-Cron-Secret": "YOUR_SECRET" },
      "timeout": 300
    },
    "notifications": {
      "onFailure": {
        "email": "ops@yourcompany.com"
      }
    }
  }'
```

`0 2 * * *` — runs at 2:00 AM UTC every day. Off-peak hours keep it cheap.

## Step 4: Prune old backups

Add a second weekly job to delete backups older than 30 days:

```js
import {
  ListObjectsV2Command,
  DeleteObjectsCommand
} from "@aws-sdk/client-s3";

export async function pruneOldBackups(retentionDays = 30) {
  const cutoff = Date.now() - retentionDays * 86_400_000;

  const { Contents = [] } = await s3.send(new ListObjectsV2Command({
    Bucket: process.env.BACKUP_BUCKET,
    Prefix: "db-backups/"
  }));

  const toDelete = Contents
    .filter(obj => obj.LastModified.getTime() < cutoff)
    .map(obj => ({ Key: obj.Key }));

  if (toDelete.length === 0) return;

  await s3.send(new DeleteObjectsCommand({
    Bucket: process.env.BACKUP_BUCKET,
    Delete: { Objects: toDelete }
  }));

  console.log(`Pruned ${toDelete.length} old backup(s)`);
}
```

Schedule this as a separate CronAPI job: `0 3 * * 0` (weekly, Sunday 3 AM).

## Tips

- **Test restores**: A backup you have never restored is not a backup. Schedule a monthly restore test.
- **Encrypt at rest**: Enable S3 SSE-S3 or use `gpg` before uploading for sensitive data.
- **MySQL**: Replace `pg_dump` with `mysqldump --single-transaction "$DATABASE_URL"`.
- **Large databases**: Stream to S3 with `pg_dump | gzip | aws s3 cp - s3://bucket/file.sql.gz` to avoid running out of `/tmp` space.

## Next steps

- [Monitor uptime](./monitor-uptime.md)
- [Build a social media scheduler](./social-media-scheduler.md)
