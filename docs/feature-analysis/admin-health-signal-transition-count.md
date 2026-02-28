# Feature Impact: Admin Health Signal Transition Count

## Summary
Added `healthSignalTransitionCount` to admin health diagnostics to quantify signal volatility over process lifetime.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added process-local transition counter for digest changes.
  - Added top-level `healthSignalTransitionCount`.
  - Added `schemaCapabilities.healthSignalTransitionCount`.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster detection of flapping health states and unstable environments)

## Risk Notes
- Process-local metric resets on cold starts/redeploys.
- Additive diagnostics-only field.
