# CronAPI

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen)](https://nodejs.org/)
[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

**Schedule HTTP calls without managing cron infrastructure.**

CronAPI is a hosted cron-as-a-service for developers. Point it at any endpoint, set a cron expression, and it fires your webhook on schedule — no servers, no crontabs, no ops overhead.

---

## Quick Start

**1. Register and get your API key**

```bash
curl -X POST https://api.cronapi.dev/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "you@example.com"}'
```

Response:
```json
{
  "userId": "abc123",
  "apiKey": "cron_live_xxxxxxxxxxxx",
  "plan": "free"
}
```

> Save your API key — it is shown only once.

**2. Create your first scheduled job**

```bash
curl -X POST https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer cron_live_xxxxxxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hourly ping",
    "endpointUrl": "https://yourapp.com/tasks/run",
    "cronExpression": "0 * * * *",
    "httpMethod": "POST"
  }'
```

**3. Check your job**

```bash
curl https://api.cronapi.dev/api/v1/jobs \
  -H "Authorization: Bearer cron_live_xxxxxxxxxxxx"
```

That's it. Your endpoint will be called every hour.

---

## API Reference

Base URL: `https://api.cronapi.dev`

Authentication: pass your API key as a Bearer token in the `Authorization` header.

### Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/auth/register` | Register and get an API key |
| `GET` | `/api/v1/auth/me` | Get current user info |
| `GET` | `/api/v1/auth/keys` | List your API keys |
| `POST` | `/api/v1/auth/keys` | Create a new API key |
| `DELETE` | `/api/v1/auth/keys/:keyId` | Revoke an API key |

### Jobs

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/jobs` | List all your jobs |
| `POST` | `/api/v1/jobs` | Create a new job |
| `GET` | `/api/v1/jobs/:jobId` | Get a single job |
| `PATCH` | `/api/v1/jobs/:jobId` | Update a job |
| `DELETE` | `/api/v1/jobs/:jobId` | Delete a job |
| `GET` | `/api/v1/jobs/:jobId/executions` | Get execution history |

### System

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (DB + scheduler status) |
| `GET` | `/status` | Public status (uptime, active jobs, next run) |
| `GET` | `/api/v1/pricing` | Pricing plans |
| `POST` | `/api/v1/waitlist` | Join the waitlist |

For full request/response schemas and examples, see [DOCS.md](./DOCS.md).

---

## Pricing

| Plan | Price | Jobs | Min Interval |
|------|-------|------|--------------|
| **Free** | $0/mo | 10 | Every hour |
| **Indie** | $9/mo | 100 | Every minute |
| **Pro** | $29/mo | Unlimited | Every minute |

Upgrade any time via the dashboard or Stripe checkout.

---

## Deploy Your Own

Run CronAPI on your own infrastructure in minutes.

### Requirements

- Node.js ≥ 20
- PostgreSQL

### Environment Variables

```env
DATABASE_URL=postgresql://user:password@host:5432/cronapi
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_INDIE_PRICE_ID=price_...
STRIPE_PRO_PRICE_ID=price_...
PORT=3000
```

### Run with Docker

```bash
docker build -t cronapi .
docker run -p 3000:3000 --env-file .env cronapi
```

### Deploy to Railway

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

1. Fork this repo
2. Connect to Railway
3. Add a PostgreSQL plugin
4. Set environment variables
5. Deploy

---

## How It Works

1. You create a job with a cron expression and a target URL
2. CronAPI's scheduler (runs every minute) checks for jobs due to fire
3. It makes the HTTP request to your endpoint with your configured method, headers, and body
4. The execution result (status code, response) is stored for 30 days
5. Your job's `nextRunAt` is updated for the following interval

---

## License

MIT
