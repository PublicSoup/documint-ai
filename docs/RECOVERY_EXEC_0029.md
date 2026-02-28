# Recovery Exec 00:29

## Blocker
- `exec denied: allowlist miss`

## Safe Fallback
- Continue safe file-level hardening + documentation.
- Defer verify/commit until runtime shell access is restored.

## Exact Unblock Commands
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Post-Unblock Flush
```bash
pwd
npm run build
npm run lint
npm run test

git status --short
git add -A
git commit -m "chore(recovery): flush deferred queue after exec restore"
```
