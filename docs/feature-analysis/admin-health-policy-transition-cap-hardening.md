# Feature Impact: Admin Health Policy Transition Cap Hardening

## Summary
Hardened policy mismatch and policy action transition counters with explicit caps to prevent unbounded growth in long-lived runtimes.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added max constants:
    - `POLICY_MISMATCH_TRANSITION_COUNT_MAX`
    - `POLICY_MISMATCH_ACTION_TRANSITION_COUNT_MAX`
  - Transition increments now clamp to max via `Math.min(...)`.
  - Added top-level cap state fields:
    - `policyMismatchTransitionCountCapped`
    - `policyMismatchActionTransitionCountCapped`
  - Added matching `schemaCapabilities` flags.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (safer long-lived observability behavior and reduced drift risk)

## Risk Notes
- Additive diagnostics-only behavior.
- Process-local counters still reset on cold starts/redeploys.
