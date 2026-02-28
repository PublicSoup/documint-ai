# Feature Impact: Admin Health Policy Mismatch Change Tracking

## Summary
Added first-class policy mismatch transition metadata so monitoring systems can detect compatibility state changes without external diff logic.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added process-local previous mismatch digest tracking.
  - Added top-level fields:
    - `policyMismatchChanged`
    - `policyMismatchPreviousDigest`
  - Added schema capability flags for both fields.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster policy drift transition detection and reduced monitor-side complexity)

## Risk Notes
- Process-local tracking resets on cold starts/redeploys.
- Additive diagnostics-only fields.
