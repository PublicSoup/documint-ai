# Recovery Deferred Commit Plan

## Blocker
- Runtime shell denied: `exec denied: allowlist miss`

## Safe Fallback Applied
- Continued safe file-level growth/hardening work.
- Kept memory + feature-analysis docs current for zero-context handoff.

## Exact Unblock Commands (host terminal)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## One-Pass Flush Plan After Unblock
```bash
pwd
npm run build
npm run lint
npm run test

git status --short
git add -A
git commit -m "chore(recovery): flush deferred batches and verification queue"
```

## If test script is missing
- Record exception in `docs/UNSAFE_DEPLOY_BLOCKERS.md` and proceed with build/lint gate.
