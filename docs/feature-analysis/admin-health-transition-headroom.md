# Feature Impact: Admin Health Transition Headroom

## Summary
Added transition counter headroom metadata so operators can see how close process-local volatility tracking is to saturation.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `healthSignalTransitionCountRemaining`.
  - Derived from `HEALTH_SIGNAL_TRANSITION_COUNT_MAX - healthSignalTransitionCount` (bounded at zero).
  - Added `schemaCapabilities.healthSignalTransitionCountRemaining` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (proactive observability-state maintenance)

## Risk Notes
- Additive diagnostics-only field.
- Process-local counters still reset on cold starts/redeploys.
