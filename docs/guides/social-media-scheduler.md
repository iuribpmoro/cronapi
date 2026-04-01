# Build a Social Media Scheduler with CronAPI

Queue posts ahead of time and let CronAPI publish them at exactly the right moment — no third-party social scheduling SaaS required.

## Prerequisites

- A CronAPI account
- API access to the social platforms you want to post to (Twitter/X, LinkedIn, etc.)
- A small backend to store your post queue and handle publishing

## Architecture

```
Your app / content editor
      │  add post to queue (DB)
      ▼
CronAPI job (every minute)
      │  POST /publish-scheduled
      ▼
Your publish endpoint
      │  query DB for due posts
      │  call Twitter / LinkedIn API
      ▼
Social platform
```

## Step 1: Store posts in a queue table

```sql
CREATE TABLE scheduled_posts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform    TEXT NOT NULL,          -- 'twitter', 'linkedin', etc.
  content     TEXT NOT NULL,
  media_urls  TEXT[],
  scheduled_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  status      TEXT NOT NULL DEFAULT 'pending',  -- pending | published | failed
  error       TEXT
);
```

## Step 2: Write the publish endpoint

```js
// routes/publish.js
import express from "express";
import { db } from "../db.js";
import { postToTwitter, postToLinkedIn } from "../social.js";

const router = express.Router();

router.post("/publish-scheduled", async (req, res) => {
  if (req.headers["x-cron-secret"] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // Claim due posts atomically to avoid double-publishing
  const posts = await db.query(`
    UPDATE scheduled_posts
    SET status = 'publishing'
    WHERE status = 'pending'
      AND scheduled_at <= NOW()
    RETURNING *
  `);

  res.status(202).json({ queued: posts.rows.length });

  for (const post of posts.rows) {
    try {
      if (post.platform === "twitter") {
        await postToTwitter(post.content, post.media_urls);
      } else if (post.platform === "linkedin") {
        await postToLinkedIn(post.content, post.media_urls);
      }

      await db.query(
        `UPDATE scheduled_posts SET status = 'published', published_at = NOW() WHERE id = $1`,
        [post.id]
      );
    } catch (err) {
      await db.query(
        `UPDATE scheduled_posts SET status = 'failed', error = $2 WHERE id = $1`,
        [post.id, err.message]
      );
    }
  }
});

export default router;
```

## Step 3: Post to Twitter/X

```js
// social.js  (uses Twitter API v2)
import { TwitterApi } from "twitter-api-v2";

const twitter = new TwitterApi({
  appKey:    process.env.TWITTER_API_KEY,
  appSecret: process.env.TWITTER_API_SECRET,
  accessToken:  process.env.TWITTER_ACCESS_TOKEN,
  accessSecret: process.env.TWITTER_ACCESS_SECRET
});

export async function postToTwitter(text, mediaUrls = []) {
  const client = twitter.readWrite;
  const mediaIds = [];

  for (const url of mediaUrls) {
    const buffer = await fetch(url).then(r => r.buffer());
    const id = await client.v1.uploadMedia(buffer, { type: "png" });
    mediaIds.push(id);
  }

  await client.v2.tweet({ text, ...(mediaIds.length && { media: { media_ids: mediaIds } }) });
}
```

## Step 4: Schedule the polling job in CronAPI

```bash
curl -X POST https://api.cronapi.io/v1/jobs \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Publish scheduled social posts",
    "schedule": "* * * * *",
    "type": "http",
    "config": {
      "url": "https://yourapp.com/publish-scheduled",
      "method": "POST",
      "headers": { "X-Cron-Secret": "YOUR_SECRET" },
      "timeout": 30
    }
  }'
```

Running every minute gives you 1-minute scheduling granularity.

## Step 5: Queue a post from your app

```js
await db.query(
  `INSERT INTO scheduled_posts (platform, content, scheduled_at)
   VALUES ($1, $2, $3)`,
  ["twitter", "Just launched our new feature! Check it out 🚀", "2024-06-15T14:00:00Z"]
);
```

## Tips

- **Rate limits**: Buffer posts if you queue many at once — space them ≥1 minute apart per platform.
- **Retry failed posts**: Add a CronAPI job that retries rows with `status = 'failed'` and `scheduled_at > NOW() - interval '1 hour'`.
- **LinkedIn**: Use the LinkedIn Share API (UGC Posts endpoint) with your OAuth2 token.
- **Thread support**: For Twitter threads, post sequentially and pass the previous tweet's `id` as `reply.in_reply_to_tweet_id`.
- **Dry run mode**: Add `?dryRun=true` handling during testing to log without publishing.

## Next steps

- [Send Slack summaries](./slack-summaries.md)
- [Monitor uptime](./monitor-uptime.md)
