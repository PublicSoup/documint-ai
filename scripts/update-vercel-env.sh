#!/bin/bash
echo "Updating Vercel Environment Variables..."

set_env() {
    NAME=$1
    VALUE=$2
    # Try to remove existing first (ignore failure)
    vercel env rm $NAME production -y >/dev/null 2>&1 || true
    # Add new value
    printf "%s" "$VALUE" | vercel env add $NAME production
    echo "✅ Set $NAME"
}

# AI
set_env "GOOGLE_API_KEY" "AIzaSyABh39uH39B9VgrqHtTzunyDzIshMKnYE0"

# Stripe Keys
set_env "STRIPE_SECRET_KEY" "sk_test_51SovimDi2vzgLJOrvwxxEWr64sltsmm60cCT7XCvQRYWc9BmYJRaz8fQVX8hk5WOdUpWuHZSuvU5LSES3ZQ7ugsq00L040jFFv"
set_env "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY" "pk_test_51SovimDi2vzgLJOr8x3FL1cv63Tu6c77GOtXsvf9rF5G19uMO0YgLBNJHuOsOTmbdzstZQ7TWWmu3ZbeF3NK8O3Y00S6Vtk9kt"
set_env "STRIPE_WEBHOOK_SECRET" "whsec_a4dacd69339c1c7f06f41bc0b091342009c303d9efdbe75ef2a5c6dfcbd621ff"

# Stripe Prices
set_env "STRIPE_PRICE_ID_STARTER" "price_1SynFwDi2vzgLJOr2Ek4X9nw"
set_env "STRIPE_PRICE_ID_PRO" "price_1SynFwDi2vzgLJOriJwl0b56"
set_env "STRIPE_PRICE_ID_TEAM" "price_1SynFwDi2vzgLJOrQuAqjsYd"

# App Config
set_env "NEXT_PUBLIC_DEV_PRO" "false"

echo "🎉 All environment variables updated!"
