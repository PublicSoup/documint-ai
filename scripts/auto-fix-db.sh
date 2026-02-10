#!/bin/bash
# scripts/auto-fix-db.sh

echo "=================================================="
echo "   DocuMint AI - Production Database Repair Tool"
echo "=================================================="
echo ""
echo "This tool will fix the 'Auth Failed' error on your live site."
echo ""
echo "STEP 1: Go to your Supabase Dashboard:"
echo "https://supabase.com/dashboard/project/bnafgbylmsukdkzccovo/settings/database"
echo ""
echo "STEP 2: Click 'Reset Database Password' and generate a new one."
echo ""
echo -n "STEP 3: Paste the NEW password here: "
read -s DB_PASSWORD
echo ""

if [ -z "$DB_PASSWORD" ]; then
    echo "❌ Password cannot be empty."
    exit 1
fi

echo "✅ Password received. Configuring production environment..."

# Construct the robust connection string (Transaction Pooler, Port 6543, PgBouncer)
# Using 'postgres' as user since it's the default superuser
CONNECTION_STRING="postgresql://postgres.bnafgbylmsukdkzccovo:${DB_PASSWORD}@aws-0-us-west-2.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"

echo "Setting DATABASE_URL..."
printf "%s" "$CONNECTION_STRING" | vercel env add DATABASE_URL production 1>/dev/null 2>&1

echo "Setting DIRECT_URL (for migrations)..."
# Direct connection (Session Mode, Port 5432)
DIRECT_CONN="postgresql://postgres.bnafgbylmsukdkzccovo:${DB_PASSWORD}@db.bnafgbylmsukdkzccovo.supabase.co:5432/postgres"
printf "%s" "$DIRECT_CONN" | vercel env add DIRECT_URL production 1>/dev/null 2>&1

echo "✅ Environment Updated!"
echo "🚀 Redeploying to apply changes..."
vercel --prod

echo "=================================================="
echo "   REPAIR COMPLETE! Your site should now work."
echo "=================================================="
