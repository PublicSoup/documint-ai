# Recovery: Exec Unblock Steps

## Blocker
`exec denied: allowlist miss`

## Safe Fallback Mode
- Continue file-level improvements and documentation only.
- Defer verify/commit until shell path recovers.

## Exact Unblock Commands (host terminal)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Validate + Flush
```bash
pwd
npm run build
npm run lint
npm run test

git status --short
git add -A
git commit -m "chore(recovery): flush deferred queue after exec unblock"
```
