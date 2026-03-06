# Fresh Vercel Deployment Guide

Since your Vercel project might be outdated or disconnected, let's set up a fresh deployment.

## Option 1: Deploy via Vercel Dashboard (Recommended - No CLI needed)

### Step 1: Go to Vercel Dashboard
1. Open: https://vercel.com/new
2. Log in with your Vercel account

### Step 2: Import Your GitHub Repository
1. Click **"Import Git Repository"**
2. Find **`PublicSoup/documint-ai`** (or your repo name)
3. Click **"Import"**

### Step 3: Configure Project
**Framework Preset:** Next.js
**Root Directory:** `./`
**Build Command:** Leave default (`next build`)
**Output Directory:** Leave default (`.next`)

### Step 4: Add Environment Variables (CRITICAL!)
Before clicking "Deploy", expand **"Environment Variables"** and add these:

```bash
# Copy these from your .env file

DATABASE_URL=your_database_url_here

STRIPE_SECRET_KEY=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
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51SovimDi2vzgLJOrTOvYH8pdCMEHFDIropROrm1t7jg9TBtdz2PDhEdzIrEsaoLE5fmzfoOumiJy0lt2DU5xmVA3005iso6BoN
STRIPE_WEBHOOK_SECRET=whsec_o1SF3bf2cwJLdMC7f5a0L22O0Id3jVm8
STRIPE_PRICE_ID_STARTER=price_1SuofBDi2vzgLJOrGWT1AaAX
STRIPE_PRICE_ID_PRO=price_1SuofBDi2vzgLJOrLYeocxwQ
STRIPE_PRICE_ID_TEAM=price_1SuofCDi2vzgLJOrzZd4RxmZ

NEXTAUTH_SECRET=your_32_character_secret_here
NEXTAUTH_URL=https://documintai.dev
NEXT_PUBLIC_APP_URL=https://documintai.dev

GOOGLE_API_KEY=your_google_api_key_here

# Optional
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
RESEND_API_KEY=your_resend_key
EMAIL_FROM=noreply@documint.ai
NEXT_PUBLIC_DEV_PRO=false
```

### Step 5: Set Custom Domain
After deployment:
1. Go to your project **Settings** → **Domains**
2. Add: `documintai.dev`
3. Follow DNS setup instructions

### Step 6: Deploy
Click **"Deploy"** and wait 2-3 minutes

---

## Option 2: Enable PowerShell Scripts (For Vercel CLI)

If you want to use Vercel CLI instead:

1. Open PowerShell as Administrator
2. Run:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```
3. Type `Y` to confirm
4. Then run:
```bash
npm install -g vercel
vercel login
vercel --prod
```

---

## After Deployment

1. **Update Stripe Webhook URL:**
   - Go to: https://dashboard.stripe.com/webhooks
   - Add endpoint: `https://documintai.dev/api/webhooks/stripe`

2. **Test the site:**
   - https://documintai.dev/dashboard/billing
   - Try creating a checkout session

---

## Quick Checklist

- [ ] Import GitHub repo to Vercel
- [ ] Add ALL environment variables
- [ ] Set custom domain (documintai.dev)
- [ ] Wait for deployment to complete
- [ ] Update Stripe webhook URL
- [ ] Test billing page
- [ ] Test AI chat

---

**Need help?** Let me know which option you want to use and I'll guide you through it step by step.
