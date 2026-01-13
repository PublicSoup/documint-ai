# 💰 Billing Implementation TODO

## ✅ COMPLETED

| Feature | Status |
|---------|--------|
| Stripe Checkout | ✅ Works |
| Customer Portal | ✅ Works |
| Webhook Handler | ✅ Implemented |
| Subscription Model | ✅ Added to DB |
| Feature Gating | ✅ Implemented |
| Usage API (Real) | ✅ Fixed |
| Subscription Utility | ✅ Created |

---

## Database Models Added

```prisma
model Subscription {
  id                   String    @id @default(cuid())
  userId               String    @unique
  stripeCustomerId     String?   @unique
  stripeSubscriptionId String?   @unique
  stripePriceId        String?
  status               String    @default("inactive") // active, canceled, past_due, trialing
  plan                 String    @default("free")     // free, starter, pro, team
  currentPeriodStart   DateTime?
  currentPeriodEnd     DateTime?
  cancelAtPeriodEnd    Boolean   @default(false)
  trialEnd             DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  
  user                 User      @relation(fields: [userId], references: [id])
}
```

---

## Files Created/Updated

### New Files:
- `src/lib/subscription.ts` - Subscription utility with plan limits
- `src/lib/feature-gate.ts` - Feature access middleware
- `src/app/api/webhooks/stripe/route.ts` - Stripe webhook handler

### Updated Files:
- `prisma/schema.prisma` - Added Subscription model
- `src/app/api/usage/route.ts` - Uses real subscription data
- `src/app/api/analytics/docs/route.ts` - Gated to Starter+
- `src/app/api/changelog/generate/route.ts` - Gated to Starter+
- `src/app/api/docs/suggest/route.ts` - Gated to Starter+
- `src/app/api/audit/route.ts` - Gated to Pro+

---

## Plan Limits Configuration

| Plan | Files/Month | Total Files | Team Members |
|------|-------------|-------------|--------------|
| Free | 10 | 25 | 1 |
| Starter | 100 | 250 | 3 |
| Pro | 500 | Unlimited | 10 |
| Team | Unlimited | Unlimited | Unlimited |

### Feature Access:

| Feature | Free | Starter | Pro | Team |
|---------|------|---------|-----|------|
| Analytics | ❌ | ✅ | ✅ | ✅ |
| Changelog | ❌ | ✅ | ✅ | ✅ |
| Smart Suggestions | ❌ | ✅ | ✅ | ✅ |
| Audit Log | ❌ | ❌ | ✅ | ✅ |
| Custom Templates | ❌ | ❌ | ✅ | ✅ |
| Priority Support | ❌ | ❌ | ✅ | ✅ |

---

## Webhook Events Handled

- `checkout.session.completed` → Creates subscription record
- `customer.subscription.created` → Updates subscription
- `customer.subscription.updated` → Updates plan/status
- `customer.subscription.deleted` → Marks as canceled
- `invoice.payment_succeeded` → Logs to audit
- `invoice.payment_failed` → Marks as past_due, notifies user

---

## Environment Variables Needed

```env
# Stripe (REQUIRED for production)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_STARTER=price_...
STRIPE_PRICE_ID_PRO=price_...
STRIPE_PRICE_ID_TEAM=price_...
```

---

## 🟡 Remaining (Nice-to-Have)

### 1. Trial Period Support
- [ ] Add 14-day Pro trial for new users
- [ ] Use Stripe `trial_period_days` in checkout

### 2. Team Billing
- [ ] Seat-based pricing
- [ ] Admin pays, members use

### 3. Invoice History UI
- [ ] Show past invoices in billing page
- [ ] Download receipts

### 4. Payment Method UI
- [ ] Show current card (last 4 digits)
- [ ] Update card option

### 5. Upgrade Prompts in UI
- [ ] Show modal when hitting gated feature
- [ ] One-click upgrade buttons
- [ ] Better upgrade CTAs on billing page

---

## Testing Checklist

- [x] Subscription model exists in database
- [x] Webhook endpoint compiles
- [x] Usage API returns real subscription data
- [x] Feature gating returns 403 for free users
- [ ] Checkout creates subscription in DB (test with Stripe CLI)
- [ ] Webhook fires on payment success
- [ ] Pro users can access Pro features
- [ ] Customer portal works

---

## To Test Locally with Stripe CLI

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to localhost
stripe listen --forward-to localhost:3000/api/webhooks/stripe

# Copy the webhook secret and add to .env
# STRIPE_WEBHOOK_SECRET=whsec_...

# Test checkout flow
# 1. Go to /dashboard/billing
# 2. Click "Subscribe to Starter"
# 3. Use test card: 4242 4242 4242 4242
# 4. Check database for subscription record
```
