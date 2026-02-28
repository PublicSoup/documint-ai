# Recovery Final Unblock

## Blocker
- Runtime shell blocked: `exec denied: allowlist miss`

## Safe Fallback
- Continue documentation + file-level hardening only until shell path returns.

## Exact Unblock Commands (host terminal)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Verify + Flush Queue
```bash
pwd
npm run build
npm run lint
npm run test

git status --short
git add -A
git commit -m "chore(recovery): flush deferred verification and commits"
```
