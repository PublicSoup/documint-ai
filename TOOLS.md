# TOOLS.md - Local Execution & Delivery Notes

## OpenClaw Runtime Baseline (Required)

### Shell execution (mandatory for build/test/commit)
- Preferred: `tools.exec.host = "gateway"`
- Alternative: `agents.defaults.sandbox.mode = "non-main"` or `"all"`
- Fallback: `tools.exec.host = "node"`

### Gateway daemon
- `openclaw gateway status`
- `openclaw gateway start`
- `openclaw gateway restart`

## Known Failure Modes + Mitigation

1. **`exec denied: allowlist miss`**
   - Mitigation: route exec through gateway/node host.
2. **`sandbox runtime unavailable`**
   - Mitigation: enable sandbox mode or gateway host.
3. **`spawn docker ENOENT`**
   - Mitigation: avoid docker-dependent paths; use local/gateway execution.
4. **subagent thread hook unavailable**
   - Mitigation: execute in main session or one-shot subagent run mode.

## DocuMint AI Verification Pipeline

Run after each meaningful batch:
1. `npm run build`
2. `npm run lint` (if configured)
3. `npm run test` (if configured)

## Engineering Guardrails

- No `any` types
- No placeholders/stubs in production paths
- No bare `console.log` in API/server code
- Every mutation route must include:
  - authn + authz
  - zod validation
  - rate limiting
  - standardized error envelope
  - audit logging
