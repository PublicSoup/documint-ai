# Feature Impact: Admin Health Transition Velocity Per Minute

## Summary
Added `healthSignalTransitionVelocityPerMin` to admin health diagnostics for time-normalized volatility alerting.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `healthSignalTransitionVelocityPerMin`.
  - Velocity is derived from transition count divided by stability-window minutes.
  - Added `schemaCapabilities.healthSignalTransitionVelocityPerMin` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (better volatility tuning and alert threshold normalization)

## Risk Notes
- Additive diagnostics-only field.
- Process-local counters reset on cold starts/redeploys.
