# Feature Impact: Admin Health Transition Count Cap

## Summary
Hardened process-local health signal transition tracking with an upper bound to prevent unbounded counter growth in long-lived runtimes.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `HEALTH_SIGNAL_TRANSITION_COUNT_MAX`.
  - Transition count now increments with `Math.min(..., MAX)` cap.
  - Added top-level `healthSignalTransitionCountCapped` boolean.
  - Added `schemaCapabilities.healthSignalTransitionCountCapped` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (safer long-running observability state and reduced drift risk)

## Risk Notes
- Additive diagnostics-only change.
- Process-local behavior still resets on cold starts/redeploys.
