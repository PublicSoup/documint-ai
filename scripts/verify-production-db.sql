-- Run this in your Supabase SQL Editor to check deployment status

-- Check if indexes were created
SELECT 
    tablename, 
    indexname 
FROM pg_indexes 
WHERE schemaname = 'public'
    AND indexname LIKE '%_idx'
ORDER BY tablename, indexname;

-- Check if there are any users
SELECT COUNT(*) as user_count FROM "User";

-- Check Stripe integration
SELECT 
    "userId",
    "stripeCustomerId",
    "plan",
    "status"
FROM "Subscription"
LIMIT 5;
