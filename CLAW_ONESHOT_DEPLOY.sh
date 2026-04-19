#!/usr/bin/env bash
# CLAW_ONESHOT_DEPLOY.sh
# Automated script to build and deploy DocuMint AI to Cloudflare Workers

set -e

echo "🚀 Starting DocuMint AI Cloudflare Oneshot Deployment"

# Check dependencies
if ! command -v wrangler &> /dev/null; then
    echo "⚠️ Wrangler CLI not found. Running via npx."
    WRANGLER_BIN="npx wrangler"
else
    WRANGLER_BIN="wrangler"
fi

echo "📦 Generating Prisma Client..."
npx prisma generate

echo "🏗 Building Next.js application..."
npm run build

echo "☁️ Adapting for Cloudflare with OpenNext..."
npx @opennextjs/cloudflare

echo "🔍 Build complete. Ready for deployment."

# Optional: Prompt to deploy
read -p "Do you want to deploy to Cloudflare now? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🚀 Deploying to Cloudflare Workers..."
    $WRANGLER_BIN deploy .open-next/worker.js
    echo "✅ Deployment finished."
else
    echo "⏸ Deployment skipped. You can deploy later using 'npm run cf:deploy'."
fi
