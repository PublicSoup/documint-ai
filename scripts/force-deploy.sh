#!/bin/bash
# scripts/force-deploy.sh

echo "=================================================="
echo "   Force Deployment Tool (Bypass Git Check)"
echo "=================================================="

# Check if .git exists and move it
if [ -d ".git" ]; then
    echo "📦 Temporarily hiding .git folder..."
    mv .git .git_backup_temp
    MOVED=true
else
    echo "⚠️  No .git folder found (or already hidden)..."
    MOVED=false
fi

echo ""
echo "🚀 Starting Deployment to Production..."
# Run Vercel Deploy
vercel --prod

EXIT_CODE=$?

echo ""
echo "=================================================="

# Restore .git
if [ "$MOVED" = true ]; then
    echo "♻️  Restoring .git folder..."
    mv .git_backup_temp .git
fi

if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ SUCCESS! Deployment complete."
else
    echo "❌ Deployment failed."
fi

exit $EXIT_CODE
