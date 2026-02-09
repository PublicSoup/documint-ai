# Vercel Environment Variable Setup

## ⚠️ CRITICAL: Your Stripe checkout is failing because environment variables aren't set in Vercel

### Step 1: Go to Vercel Dashboard

1. Go to: https://vercel.com/dashboard
2. Click on your project (the one that deploys to documintai.dev)
3. Go to **Settings** → **Environment Variables**

### Step 2: Add ALL These Variables

Copy these from your local `.env` file:

```bash
# Database
DATABASE_URL=your_supabase_connection_string

# Stripe (CRITICAL - without these, checkout fails)
STRIPE_SECRET_KEY=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
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_51SovimDi2vzgLJOrTOvYH8pdCMEHFDIropROrm1t7jg9TBtdz2PDhEdzIrEsaoLE5fmzfoOumiJy0lt2DU5xmVA3005iso6BoN
STRIPE_WEBHOOK_SECRET=whsec_o1SF3bf2cwJLdMC7f5a0L22O0Id3jVm8
STRIPE_PRICE_ID_STARTER=price_1SuofBDi2vzgLJOrGWT1AaAX
STRIPE_PRICE_ID_PRO=price_1SuofBDi2vzgLJOrLYeocxwQ
STRIPE_PRICE_ID_TEAM=price_1SuofCDi2vzgLJOrzZd4RxmZ

# Authentication
NEXTAUTH_SECRET=your_32_char_secret
NEXTAUTH_URL=https://documintai.dev
NEXT_PUBLIC_APP_URL=https://documintai.dev

# Google Gemini AI
GOOGLE_API_KEY=your_google_api_key

# Optional but recommended
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token
RESEND_API_KEY=your_resend_key
EMAIL_FROM=noreply@documint.ai
```

### Step 3: Set Environment Scope

For each variable:
- Check **Production**, **Preview**, and **Development**
- This ensures they work in all environments

### Step 4: Redeploy

After adding variables:
1. Go to **Deployments** tab
2. Click the **...** menu on the latest deployment
3. Click **Redeploy**

OR just push a new commit:
```bash
git commit --allow-empty -m "Trigger redeploy after env var setup"
git push origin main
```

### Step 5: Verify

After deployment completes, test checkout again.

---

## Quick Check: Are Variables Set?

Run this in your terminal to see what Vercel has:

```bash
vercel env ls
```

If you don't have Vercel CLI installed:
```bash
npm i -g vercel
vercel login
vercel link
vercel env ls
```

---

## Common Issues

### "couldn't create checkout session"
→ Stripe environment variables not set in Vercel

### "Unauthorized" on checkout
→ NEXTAUTH_SECRET or NEXTAUTH_URL not set

### Checkout redirects to wrong domain
→ NEXT_PUBLIC_APP_URL doesn't match your domain

---

## What's Happening

Your **local .env** works perfectly (I just tested it ✅), but **Vercel doesn't have access** to your local `.env` file. You need to manually add them in the Vercel dashboard.
