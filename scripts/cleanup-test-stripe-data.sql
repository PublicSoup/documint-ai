-- Clean up test Stripe data from database
-- Run this in your database (Supabase SQL Editor or similar)

-- Option 1: Remove all test customer IDs
UPDATE "Subscription"
SET "stripeCustomerId" = NULL,
    "stripeSubscriptionId" = NULL
WHERE "stripeCustomerId" LIKE 'cus_test%'
   OR "stripeCustomerId" IS NULL;

-- Option 2: Delete test subscriptions entirely (more aggressive)
-- DELETE FROM "Subscription"
-- WHERE "stripeCustomerId" LIKE 'cus_test%'
--    OR "stripeCustomerId" IS NULL;

-- Verify the cleanup
SELECT 
    "userId", 
    "stripeCustomerId", 
    "plan", 
    "status"
FROM "Subscription"
WHERE "stripeCustomerId" IS NOT NULL;
