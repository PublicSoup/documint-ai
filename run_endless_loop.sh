#!/bin/bash

# Endless OpenClaw Execution Loop
# Forces OpenClaw to run enterprise delivery batches continuously without stopping

echo "============================================="
echo "🦞 OpenClaw Endless Execution Loop Started"
echo "============================================="

while true; do
  echo "[DEBUG] Starting new enterprise batch at $(date)"
  
  openclaw agent --agent main --session-id "loop-$(date +%s)" --message "Run exactly one autonomous enterprise batch: Audit -> Plan -> Implement -> Verify -> Document -> Commit. Prioritize enterprise plan milestones (security/reliability first, then conversion, then IDE/WebContainer/Mermaid reliability). If blocked, do one recovery batch with exact unblock commands."
  
  echo "[DEBUG] Batch completed at $(date). Sleeping for 60 seconds before next loop to allow API rate limits to refill..."
  sleep 60
done
