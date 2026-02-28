# Recovery Exec 02:29

## Blocker
- Runtime shell blocked: `exec denied: allowlist miss`

## Safe Fallback Applied
- Continue safe file-level hardening/documentation only.
- Defer verify + commit until executable backend path is restored.

## Exact Unblock Commands (host terminal)
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
