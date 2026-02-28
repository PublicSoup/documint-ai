# Exec Runtime Unblock (Recovery Playbook)

## Current blocker
`exec denied: allowlist miss`

## Impact
- Build/lint/test/commit commands cannot run from agent runtime.
- Cron reminders still trigger, but autonomous implementation/verification can stall.

## Safe fallback while blocked
- Continue file-level hardening and documentation updates only.
- Queue verification and commit steps until execution backend is restored.

## Exact unblock commands (host terminal)
```bash
openclaw gateway status
openclaw gateway start
openclaw gateway restart
openclaw status
```

## Required config state
Set shell execution path to one of:
- `tools.exec.host = "gateway"` (preferred)
- `tools.exec.host = "node"` (fallback)
- `agents.defaults.sandbox.mode = "non-main"` or `"all"`

## Quick validation after fix
Run in agent/runtime:
```bash
openclaw status
npm run build
```

If these succeed, autonomous batches can resume full Audit→Plan→Implement→Verify→Document→Commit flow.
