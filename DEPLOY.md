# Deploying CronAPI

Two deployment options are available: **Render** (recommended, automated) and **Railway** (requires manual account setup).

---

## Option 1: Render (Recommended)

Render supports automated deployments from GitHub with no interactive browser login required.

### Steps

1. **Create a Render account** (if you don't have one)
   - Go to https://render.com and sign up with GitHub — takes ~30 seconds.

2. **Click "New Blueprint"**
   - Go to your Render dashboard → **New +** → **Blueprint**
   - Connect your GitHub repo: `iuribpmoro/cronapi`
   - Render will auto-detect `render.yaml` and show a deploy preview.

3. **Fill in secret environment variables**
   Render will prompt you for the `sync: false` values (these are intentionally not committed to the repo):
   - `STRIPE_SECRET_KEY` — from your Stripe dashboard → Developers → API keys
   - `STRIPE_WEBHOOK_SECRET` — from Stripe → Webhooks → your endpoint secret
   - `STRIPE_INDIE_PRICE_ID` — from Stripe → Products → Indie plan price ID
   - `STRIPE_PRO_PRICE_ID` — from Stripe → Products → Pro plan price ID

   > If you haven't set up Stripe yet, you can leave these blank for now — the API will work without them, just payments won't process.

4. **Click "Apply"** — Render will:
   - Provision a free PostgreSQL database
   - Build the Docker image
   - Run migrations automatically on startup
   - Deploy the web service

5. **Set the Stripe Webhook endpoint**
   Once deployed, copy your Render service URL (e.g. `https://cronapi.onrender.com`) and add a webhook in Stripe:
   - Stripe Dashboard → Developers → Webhooks → Add endpoint
   - URL: `https://your-service.onrender.com/webhooks/stripe`
   - Events: `customer.subscription.updated`, `customer.subscription.deleted`

### Notes on the free tier

- The web service **spins down after 15 minutes of inactivity** and takes ~30s to cold-start on the next request. This is fine for early users but upgrade to a paid plan when traffic picks up.
- The PostgreSQL free tier lasts **90 days**, after which it costs $7/month. Export your data before expiry or upgrade.
- `DATABASE_URL` is automatically injected from the provisioned database — no manual config needed.

---

## Option 2: Railway (Original Plan)

The Railway config (`railway.toml`) is still in the repo if you prefer it. Railway requires:
1. Manual account creation at https://railway.app
2. Creating a new project and connecting the GitHub repo
3. Adding a PostgreSQL plugin
4. Setting the same environment variables listed above

---

## Verifying the Deployment

Once live, hit these endpoints to confirm everything works:

```bash
# Health check (DB + scheduler status)
curl https://your-service.onrender.com/health

# Public status page
curl https://your-service.onrender.com/status

# Pricing info
curl https://your-service.onrender.com/api/v1/pricing
```

All three should return JSON responses with 200 status.
