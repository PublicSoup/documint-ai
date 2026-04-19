#!/bin/bash

# Configuration
SECRETS=(
  "DATABASE_URL"
  "DIRECT_URL"
  "NEXTAUTH_SECRET"
  "STRIPE_SECRET_KEY"
  "STRIPE_WEBHOOK_SECRET"
  "GOOGLE_API_KEY"
  "RESEND_API_KEY"
  "SUPABASE_SERVICE_ROLE_KEY"
)

VARS=(
  "EMAIL_FROM"
  "SUPABASE_URL"
  "STRIPE_PRICE_ID_STARTER"
  "STRIPE_PRICE_ID_PRO"
  "STRIPE_PRICE_ID_TEAM"
  "UPSTASH_REDIS_REST_URL"
  "UPSTASH_REDIS_REST_TOKEN"
)

# Use current directory as HOME to avoid permission issues
export HOME=$(pwd)

echo "Checking Cloudflare authentication..."
if ! npx wrangler whoami > /dev/null 2>&1; then
  echo "Error: Not logged in to Cloudflare. Please run 'npx wrangler login' first."
  exit 1
fi

echo "Syncing secrets..."
for secret in "${SECRETS[@]}"; do
  # Extract value, remove quotes and trailing whitespace/newlines
  value=$(grep "^$secret=" .env | cut -d'=' -f2- | sed -e 's/^"//' -e 's/"$//' -e 's/[[:space:]]*$//')
  if [ -n "$value" ]; then
    echo "Setting $secret..."
    echo "$value" | npx wrangler secret put "$secret"
  else
    echo "Warning: $secret not found in .env"
  fi
done

echo "Secret sync complete."
