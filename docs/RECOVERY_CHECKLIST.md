# Recovery Checklist — Blocked Exec Runtime

## Blocker
- `exec denied: allowlist miss`

## Safe Fallback Completed
- Maintained growth docs and memory continuity without requiring shell access.
- Prepared deferred verification/commit guidance.

## Exact Unblock Commands
Run on host terminal:
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Fast Diagnostic (after restart)
```bash
openclaw status
# then in assistant runtime, run a simple exec like:
# pwd
```
If `pwd` still fails with allowlist miss, switch shell execution host to gateway/node in OpenClaw config and retry.

## Post-Unblock Flush (in repo root)
```bash
npm run build
git status --short
git add -A
git commit -m "chore(recovery): flush deferred blocked batches"
```

## Optional Full Gate
```bash
npm run lint
npm run test
```

## Success Criteria
- Assistant runtime can execute shell commands.
- Build succeeds.
- Deferred changes are committed.
