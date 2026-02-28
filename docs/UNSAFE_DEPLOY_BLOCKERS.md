# Unsafe Deploy Blockers (Verification Queue)

## Current Verification Status
- `npm run build`: blocked (`exec denied: allowlist miss`)
- `npm run lint`: blocked (`exec denied: allowlist miss`)
- `npm run test`: blocked (`exec denied: allowlist miss`)
- Latest verification attempt: 2026-02-27 03:42 CST (all three blocked)

## Last Known Lint Snapshot (from prior successful verification window)
- `npm run lint`: **129 errors, 321 warnings**
- `npm run test`: script unavailable

## File-Level Regression Queues (highest concentration)
1. `src/components/ide/*`
   - Fixes: remove `any`, stabilize effect deps, eliminate dead imports/vars, tighten prop typing.
2. `src/app/dashboard/*`
   - Fixes: remove unused symbols, normalize server/client boundary imports, strict null checks for async data.
3. `src/lib/agent/*`
   - Fixes: replace implicit `any`/unknown passthrough, add explicit tool payload interfaces + guards.
4. `scripts/*.ts` and `scripts/*.js`
   - Fixes: align ESLint config expectations, remove unused vars, avoid unsafe casts and broad ignores.

## Deploy Policy
Do not mark deploy-safe until:
1. exec backend restored
2. build passes
3. lint errors reduced to zero (or explicitly excluded with reviewed policy)
4. test command availability resolved (script added or policy-documented exception)
