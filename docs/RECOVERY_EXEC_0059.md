# Recovery Exec 00:59

## Blocker
- Runtime shell denied: `exec denied: allowlist miss`

## Safe Fallback
- Continue safe hardening/documentation batches without shell dependency.
- Defer verify + commit until backend execution path is restored.

## Exact Unblock Commands (host terminal)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Validate + Flush Queue
```bash
pwd
npm run build
npm run lint
npm run test

git status --short
git add -A
git commit -m "chore(recovery): flush deferred queue after exec unblock"
```
