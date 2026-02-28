# Recovery Commands Snippet

## Blocker
`exec denied: allowlist miss`

## Unblock (host terminal)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Confirm runtime exec path
```bash
pwd
```

## Flush deferred verification + commit
```bash
npm run build
npm run lint
npm run test

git status --short
git add -A
git commit -m "chore(recovery): flush deferred blocked work"
```
