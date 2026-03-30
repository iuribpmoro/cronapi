# CronAPI Setup Guide

This guide covers everything you need to deploy CronAPI on Railway.

## Prerequisites

- A [Stripe](https://stripe.com) account
- A [Railway](https://railway.app) account
- PostgreSQL database (provisioned via Railway or externally)

---

## 1. Stripe Product & Price Setup

CronAPI has two paid plans: **Indie** ($9/month) and **Pro** ($29/month).

### Step-by-step

1. Log in to your [Stripe Dashboard](https://dashboard.stripe.com).
2. Go to **Products** → **Add product**.

#### Indie Plan
- **Name**: CronAPI Indie
- **Description**: Up to 100 cron jobs, every-minute scheduling
- **Pricing model**: Standard pricing
- **Price**: $9.00 / month (recurring)
- **Billing period**: Monthly
- Click **Save product** and note the **Price ID** (starts with `price_`)

#### Pro Plan
- **Name**: CronAPI Pro
- **Description**: Unlimited cron jobs, every-minute scheduling
- **Pricing model**: Standard pricing
- **Price**: $29.00 / month (recurring)
- **Billing period**: Monthly
- Click **Save product** and note the **Price ID** (starts with `price_`)

---

## 2. Stripe Webhook Setup

1. In Stripe Dashboard, go to **Developers** → **Webhooks** → **Add endpoint**.
2. **Endpoint URL**: `https://<your-railway-domain>/webhooks/stripe`
3. **Events to listen for**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Click **Add endpoint** and note the **Signing secret** (starts with `whsec_`).

---

## 3. Environment Variables

Set these in your Railway service's **Variables** tab:

| Variable                  | Description                                      | Example                          |
|---------------------------|--------------------------------------------------|----------------------------------|
| `DATABASE_URL`            | PostgreSQL connection string                    | `postgres://user:pass@host/db`   |
| `STRIPE_SECRET_KEY`       | Stripe secret key (from API keys page)          | `sk_live_...` or `sk_test_...`   |
| `STRIPE_WEBHOOK_SECRET`   | Webhook signing secret (from webhook endpoint)  | `whsec_...`                      |
| `STRIPE_INDIE_PRICE_ID`   | Price ID for the Indie plan ($9/mo)             | `price_...`                      |
| `STRIPE_PRO_PRICE_ID`     | Price ID for the Pro plan ($29/mo)              | `price_...`                      |
| `NODE_ENV`                | Set to `production` for live deployments        | `production`                     |
| `PORT`                    | Port to listen on (Railway sets this for you)   | `3000`                           |

> **Test vs Live keys**: Use `sk_test_` and `price_` from test mode during development. Switch to live keys before going public.

---

## 4. Database Migration

After Railway provisions your PostgreSQL instance and `DATABASE_URL` is set, run migrations:

```bash
npm run migrate
```

This applies all schema files in `src/db/`.

---

## 5. Verify Deployment

Once deployed, check these endpoints:

- `GET /health` — Returns DB connectivity, scheduler status, and uptime.
- `GET /status` — Public status page with active job count and next scheduled run.

A healthy response from `/health` looks like:

```json
{
  "status": "ok",
  "timestamp": "2026-03-30T12:00:00.000Z",
  "uptime": 42.5,
  "database": "ok",
  "scheduler": "running"
}
```

---

## 6. Test Stripe Integration (optional, recommended)

1. Use Stripe's test mode (`sk_test_` keys and test price IDs).
2. Register a user via `POST /api/v1/auth/register`.
3. Trigger a test checkout event using the [Stripe CLI](https://stripe.com/docs/stripe-cli):
   ```bash
   stripe trigger checkout.session.completed
   ```
4. Confirm the user's plan updates in the database.
