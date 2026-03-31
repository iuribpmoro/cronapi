# CronAPI with Next.js

Trigger Next.js API routes on a schedule — no custom server, no cron infrastructure.

---

## How It Works

1. You create a Next.js API route that performs some work (send emails, run reports, sync data).
2. You register that route's public URL as a CronAPI job.
3. CronAPI calls your route on your specified schedule.

Because Vercel, Netlify, and similar platforms serve API routes over HTTPS, your route is already a public HTTP endpoint — CronAPI can reach it directly.

---

## Prerequisites

- A Next.js app deployed to a public URL (Vercel, Railway, etc.)
- A CronAPI account and API key — [Quick Start](./quickstart.md)

---

## Step 1 — Create the API Route

Create `app/api/cron/daily-report/route.ts` (App Router):

```typescript
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// Store your signing secret in an environment variable
const CRONAPI_SIGNING_SECRET = process.env.CRONAPI_SIGNING_SECRET!;

function verifySignature(body: string, signature: string): boolean {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', CRONAPI_SIGNING_SECRET)
    .update(body)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export async function POST(request: NextRequest) {
  // Read raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get('x-cronapi-signature') ?? '';

  if (!verifySignature(rawBody, signature)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Your scheduled work goes here
  try {
    await generateDailyReport();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Daily report failed:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function generateDailyReport() {
  // Example: fetch data, build report, send email
  console.log('Generating daily report at', new Date().toISOString());
  // ... your logic
}
```

> **Signature verification is strongly recommended.** Without it, anyone can call your route. See [Webhook Verification](./webhook-verification.md) for the full pattern.

---

## Step 2 — Add the Signing Secret to Your Environment

In your `.env.local` (local dev) and your deployment environment (Vercel, Railway, etc.):

```env
CRONAPI_SIGNING_SECRET=a3f8c2...   # the signingSecret from your CronAPI job
```

---

## Step 3 — Register the Job with CronAPI

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer $CRONAPI_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily report — Next.js",
    "endpointUrl": "https://yourapp.vercel.app/api/cron/daily-report",
    "cronExpression": "0 8 * * *",
    "httpMethod": "POST",
    "body": "{\"trigger\": \"scheduled\"}"
  }'
```

Save the `signingSecret` from the response and set it as `CRONAPI_SIGNING_SECRET` in your deployment environment.

---

## Step 4 — Test Locally

Use [ngrok](https://ngrok.com) or [localtunnel](https://github.com/localtunnel/localtunnel) to expose your local dev server:

```bash
npx next dev &
npx ngrok http 3000
```

Temporarily register the ngrok URL as the job's endpoint to verify the route works end to end before deploying.

---

## Pages Router Equivalent

If you are using the Pages Router, the handler looks like this:

```typescript
// pages/api/cron/daily-report.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import crypto from 'crypto';

const CRONAPI_SIGNING_SECRET = process.env.CRONAPI_SIGNING_SECRET!;

export const config = {
  api: { bodyParser: false }, // must disable to read raw body
};

async function getRawBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const rawBody = await getRawBody(req);
  const signature = (req.headers['x-cronapi-signature'] as string) ?? '';
  const expected = 'sha256=' + crypto
    .createHmac('sha256', CRONAPI_SIGNING_SECRET)
    .update(rawBody)
    .digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  await generateDailyReport();
  res.status(200).json({ ok: true });
}
```

---

## Vercel Cron vs CronAPI

Vercel's built-in cron requires a Pro plan and only supports 1-minute minimum intervals on that plan. CronAPI works on any hosting platform, supports per-job secrets, stores execution history, and retries on failure — all from the free tier (hourly) or Indie tier ($9/mo, 1-minute intervals).

---

## Related Guides

- [Webhook Verification](./webhook-verification.md) — full signature verification in Node.js, Python, and Go
- [Monitoring & Alerting](./monitoring-alerting.md) — get notified when your route fails
