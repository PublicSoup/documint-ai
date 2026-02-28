# Exec Backend Recovery (OpenClaw)

## Problem
Autonomous batches are blocked when shell calls fail with:
- `exec denied: allowlist miss`

## Fast Recovery (host terminal)
1. Check daemon:
```bash
openclaw gateway status
```
2. Start/restart:
```bash
openclaw gateway start
openclaw gateway restart
```
3. Validate runtime path:
```bash
openclaw status
```

## If still blocked (`allowlist miss` persists)
Run help output checks and align config to gateway-backed exec:
```bash
openclaw help
openclaw gateway --help
```
Then ensure runtime is configured to use gateway (or node fallback) for shell execution.

## Required Runtime Setting
Set shell execution host to gateway (or node fallback) instead of restricted sandbox-only path.

## Verification Checklist
- `openclaw status` shows executable backend path available.
- Assistant runtime no longer returns `exec denied: allowlist miss`.
- Run project verification pipeline:
  1. `npm run build`
  2. `npm run lint` (if configured)
  3. `npm run test` (if configured)

## Exact Unblock Commands (copy/paste)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Why this is priority
Without shell execution, autonomous enterprise loop cannot complete Verify/Commit phases reliably.
