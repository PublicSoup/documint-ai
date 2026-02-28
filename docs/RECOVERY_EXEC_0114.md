# Recovery Exec 01:14

## Blocker
- Runtime shell unavailable: `exec denied: allowlist miss`

## Safe Fallback Applied
- Continue non-shell-safe hardening/documentation batches.
- Queue verification + commit until exec path is restored.

## Exact Unblock Commands
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Validate + Flush Deferred Queue
```bash
pwd
npm run build
npm run lint
npm run test

git status --short
git add -A
git commit -m "chore(recovery): flush deferred queue after exec unblock"
```
