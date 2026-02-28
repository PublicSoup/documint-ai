# Recovery Exec 01:29

## Blocker
- Runtime shell execution blocked: `exec denied: allowlist miss`

## Safe Fallback Applied
- Continue safe hardening/documentation work only.
- Queue verify/commit until shell backend is restored.

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
