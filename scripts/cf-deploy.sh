#!/bin/bash
set -e

# DocuMint AI Cloudflare Deployment Script
# This script prepares the build for Cloudflare Pages/Workers and deploys it.

echo "🚀 Starting Cloudflare Deployment for DocuMint AI..."

# 1. Clean up old builds
echo "🧹 Cleaning up old builds..."
rm -rf .open-next

# 2. Run Cloudflare optimized build
echo "📦 Running production build for Cloudflare..."
npm run cf:build

# 3. Verify build output
if [ ! -f ".open-next/worker.js" ]; then
    echo "❌ Build failed: .open-next/worker.js not found."
    exit 1
fi

# 4. Deploy to Cloudflare
echo "☁️ Deploying to Cloudflare..."
npm run cf:deploy

echo "✅ Deployment complete!"
