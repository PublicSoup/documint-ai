# Feature Impact: Admin Health Policy Mismatch Stability Seconds

## Summary
Added policy mismatch stability timing metadata so monitors can measure how long policy compatibility state has remained unchanged.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added process-local policy mismatch stability tracking.
  - Added top-level fields:
    - `policyMismatchStableSince`
    - `policyMismatchStabilitySec`
  - Added `schemaCapabilities` flags for both fields.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (better policy-drift timeline visibility and reduced false urgency)

## Risk Notes
- Process-local stability tracking resets on cold starts/redeploys.
- Additive diagnostics-only fields.
