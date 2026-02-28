# Unblock Exec and Ship Deferred Batches

## Identified Blocker
All Verify/Commit steps are blocked by runtime shell denial:
- `exec denied: allowlist miss`

## Safe Fallback Applied
While blocked, growth/hardening file changes were still prepared and documented. This runbook standardizes recovery so deferred verification/commits can be flushed quickly.

## Exact Unblock Commands (run on host)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Validate Exec Path
After recovery, run a cheap command from assistant runtime (or host):
```bash
pwd
```
If it succeeds, proceed.

## Flush Deferred Verification + Commits
From repo root:
```bash
npm run build
```

Then commit staged logical batches (or one recovery commit if needed):
```bash
git status --short
git add -A
git commit -m "chore(recovery): verify and persist deferred blocked batches"
```

## Optional Full Verification
```bash
npm run lint
npm run test
```

## Priority After Unblock
1. Verify and commit deferred landing/conversion changes.
2. Continue growth loop with measured conversion experiments.
3. Keep `memory/2026-02-26.md` concise per batch.
