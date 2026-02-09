# How to Configure Stripe Webhooks - Step by Step

## Step 1: Go to Stripe Webhooks Page

1. Open: https://dashboard.stripe.com/webhooks
2. Make sure you're in **LIVE mode** (toggle in top right should say "Viewing live data")

---

## Step 2: Add Webhook Endpoint

1. Click the blue **"Add endpoint"** button (top right)
2. You'll see a form with these fields:

---

## Step 3: Enter Your Endpoint URL

**Endpoint URL field:**

**For Production:**
```
https://yourdomain.com/api/webhooks/stripe
```

**For Local Testing (use ngrok):**
```
https://your-ngrok-url.ngrok.io/api/webhooks/stripe
```

**Note**: Replace `yourdomain.com` with your actual domain!

---

## Step 4: Select Events to Listen To

Click **"Select events"** button, then add these 6 events:

### ✅ Required Events:

1. **`checkout.session.completed`**
   - Triggered when a customer completes checkout
   - Creates subscription in your database

2. **`customer.subscription.created`**
   - Triggered when a subscription is created
   - Initializes subscription record

3. **`customer.subscription.updated`**
   - Triggered when subscription changes (upgrade/downgrade)
   - Updates subscription in database

4. **`customer.subscription.deleted`**
   - Triggered when subscription is canceled
   - Marks subscription as canceled

5. **`invoice.paid`**
   - Triggered when payment succeeds
   - Confirms subscription is active

6. **`invoice.payment_failed`**
   - Triggered when payment fails
   - Marks subscription as past_due

---

## Step 5: Quick Selection

In the "Select events to listen to" screen:

1. Search for: `checkout.session.completed` → Check it
2. Search for: `customer.subscription.created` → Check it
3. Search for: `customer.subscription.updated` → Check it
4. Search for: `customer.subscription.deleted` → Check it
5. Search for: `invoice.paid` → Check it
6. Search for: `invoice.payment_failed` → Check it

Click **"Add events"**

---

## Step 6: Add Description (Optional)

**Description:** 
```
DocuMint AI - Production Webhook
```

---

## Step 7: Click "Add endpoint"

Click the blue **"Add endpoint"** button at the bottom.

---

## Step 8: Copy the Signing Secret

After creating the endpoint, you'll see:

**"Signing secret"** - Click **"Reveal"**

Copy the value that looks like:
```
whsec_abc123...
```

**IMPORTANT**: This should match your `STRIPE_WEBHOOK_SECRET` in `.env`

If it's different, update your `.env` file:
```env
STRIPE_WEBHOOK_SECRET=whsec_THE_NEW_SECRET
```

---

## ✅ Verification

After setup, you should see:

- **Endpoint URL**: `https://yourdomain.com/api/webhooks/stripe`
- **Status**: ✅ Enabled
- **Events**: 6 events listening

---

## Testing the Webhook

### Option 1: Send Test Event (Easiest)

1. In the webhook details page, click **"Send test webhook"**
2. Select `checkout.session.completed`
3. Click **"Send test webhook"**
4. Check your app logs - you should see the event processed

### Option 2: Real Purchase Test

1. Go to your website
2. Start a checkout
3. Use test card: `4242 4242 4242 4242`
4. Complete purchase
5. Check Stripe dashboard > Webhooks > Your endpoint
6. You should see event delivered successfully

---

## Common Issues

### ❌ "Webhook endpoint returned 401"
**Fix**: Check that `STRIPE_WEBHOOK_SECRET` matches the signing secret in Stripe

### ❌ "Webhook endpoint returned 500"
**Fix**: Check your server logs for the actual error

### ❌ "Webhook endpoint timed out"
**Fix**: Your server might be down or URL is incorrect

---

## Need Help?

If you're stuck at any step, let me know where you're at and I can help!
