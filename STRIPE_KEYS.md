# Stripe Keys - Development vs Production

## ⚠️ Current Setup: LIVE KEYS (Production)

You're currently using LIVE Stripe keys. This is fine for production, but for development:

## Recommended: Use Test Keys for Development

### 1. Get Test Keys (for local development)

1. Go to: https://dashboard.stripe.com/test/apikeys
2. Toggle to **"Test mode"** (top right)
3. Copy test keys (start with `sk_test_` and `pk_test_`)

### 2. Use .env.local for Development

Create `.env.local` (git-ignored) with TEST keys:

```env
# .env.local (for development only)
STRIPE_SECRET_KEY=sk_test_YOUR_TEST_KEY
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_TEST_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_TEST_WEBHOOK_SECRET

# Test Price IDs (create these in Stripe test mode)
STRIPE_PRICE_ID_STARTER=price_test_...
STRIPE_PRICE_ID_PRO=price_test_...
STRIPE_PRICE_ID_TEAM=price_test_...
```

### 3. Keep .env for Production

Keep your current `.env` with LIVE keys for production deployment.

---

## Testing Stripe Locally

### Option 1: Stripe CLI (Recommended)

```bash
# Install Stripe CLI
# Windows: scoop install stripe
# Mac: brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# This gives you a webhook secret like: whsec_...
# Add it to .env.local as STRIPE_WEBHOOK_SECRET
```

### Option 2: Use Stripe Test Cards

When testing checkout, use these test cards:

| Card Number | Result |
|-------------|--------|
| `4242 4242 4242 4242` | Success |
| `4000 0000 0000 9995` | Declined |
| `4000 0025 0000 3155` | Requires authentication |

**Expiry**: Any future date (e.g., 12/34)
**CVC**: Any 3 digits (e.g., 123)

---

## Current Status

✅ **Production Ready**: You have all LIVE keys configured
✅ **Webhook Active**: If configured in Stripe dashboard
✅ **Prices Created**: 3 subscription tiers ready

## Next Steps

**For Development**:
- [ ] Create `.env.local` with test keys
- [ ] Use Stripe CLI for local webhook testing

**For Production**:
- [x] ✅ Stripe keys configured
- [ ] Verify webhook endpoint in Stripe dashboard
  - URL: `https://yourdomain.com/api/webhooks/stripe`
  - Events: See STRIPE_SETUP.md

## Test Your Integration

Want me to create a test script to verify your Stripe setup?
