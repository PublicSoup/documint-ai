#!/bin/bash
# scripts/setup-supabase-env.sh

echo "Setting up Supabase Environment Variables on Vercel..."

if [ -z "$1" ] || [ -z "$2" ]; then
    echo "Usage: ./setup-supabase-env.sh <DATABASE_URL> <DIRECT_URL> [NEXTAUTH_SECRET]"
    exit 1
fi

DATABASE_URL=$1
DIRECT_URL=$2
NEXTAUTH_SECRET=${3:-$(openssl rand -base64 32)}

# Set DATABASE_URL
echo "Setting DATABASE_URL..."
printf "%s" "$DATABASE_URL" | vercel env add DATABASE_URL production

# Set DIRECT_URL
echo "Setting DIRECT_URL..."
printf "%s" "$DIRECT_URL" | vercel env add DIRECT_URL production

# Set NEXTAUTH_SECRET if likely missing or needs update
echo "Setting NEXTAUTH_SECRET..."
printf "%s" "$NEXTAUTH_SECRET" | vercel env add NEXTAUTH_SECRET production

# Update NEXTAUTH_URL to production domain
echo "Setting NEXTAUTH_URL..."
printf "https://documintai.dev" | vercel env add NEXTAUTH_URL production

echo "✅ Environment configured! Redeploying now..."
vercel --prod
