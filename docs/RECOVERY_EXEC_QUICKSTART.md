# Exec Recovery Quickstart

## Blocker
`exec denied: allowlist miss`

## Unblock Commands (host terminal)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Verify Unblock
```bash
pwd
```

## Flush Deferred Work
```bash
npm run build
npm run lint
npm run test
git status --short
git add -A
git commit -m "chore(recovery): flush deferred verify/commit queue"
```
