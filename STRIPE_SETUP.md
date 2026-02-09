# Stripe Integration Guide

## Step 1: Get Your Stripe API Keys

1. Go to https://dashboard.stripe.com/test/apikeys (for testing)
2. Copy your keys:
   - **Publishable key** → `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - **Secret key** → `STRIPE_SECRET_KEY`

3. Add to `.env.local`:
```env
STRIPE_SECRET_KEY=sk_test_...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

---

## Step 2: Create Stripe Products & Prices

**Option A: Use the Script (Recommended)**

I can run this for you:

```bash
npm run stripe:create-prices
```

**Option B: Manual Creation**

1. Go to https://dashboard.stripe.com/test/products
2. Create 3 products:
   - **Starter** - $9/month
   - **Pro** - $29/month  
   - **Team** - $99/month
3. Copy the Price IDs to `.env.local`:
```env
STRIPE_PRICE_ID_STARTER=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_TEAM=price_...
```

---

## Step 3: Configure Stripe Webhook

**This MUST be done manually in Stripe Dashboard:**

1. Go to https://dashboard.stripe.com/test/webhooks
2. Click **"Add endpoint"**
3. **Endpoint URL**: 
   - Local: `https://yourdomain.ngrok.io/api/webhooks/stripe` (use ngrok)
   - Production: `https://yourdomain.com/api/webhooks/stripe`

4. **Events to listen for**:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`

5. Copy the **Webhook signing secret** → `STRIPE_WEBHOOK_SECRET`

---

## Step 4: Test the Integration

**I can help you test this:**

1. Run the app locally
2. Start checkout flow
3. Use Stripe test card: `4242 4242 4242 4242`

---

## Automation Available

I can:
- ✅ Run the price creation script for you
- ✅ Generate a webhook testing command
- ✅ Create a test checkout script
- ✅ Verify your .env variables

Would you like me to:
1. **Run the Stripe price creation script now?**
2. **Generate a webhook testing guide?**
3. **Create a quick test flow?**
