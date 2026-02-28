# Feature Impact: Admin Health Transition Utilization Percent

## Summary
Added `healthSignalTransitionUtilizationPct` to normalize transition-counter saturation across environments for threshold-driven monitoring.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `healthSignalTransitionUtilizationPct` (0–100).
  - Derived from transition count relative to max cap.
  - Added `schemaCapabilities.healthSignalTransitionUtilizationPct` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (better normalized alert thresholds and long-lived runtime diagnostics)

## Risk Notes
- Additive diagnostics-only field.
- Process-local counters still reset on cold starts/redeploys.
