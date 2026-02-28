# Feature Impact: Admin Health Volatility Trend Confidence

## Summary
Added `volatilityTrendConfidence` to qualify how trustworthy the volatility trend signal is based on observed transition depth.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `volatilityTrendConfidence` with values:
    - `low`
    - `medium`
    - `high`
  - Confidence is derived from `healthSignalTransitionCount` thresholds.
  - Added `schemaCapabilities.volatilityTrendConfidence` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (safer automation decisions using trend confidence)

## Risk Notes
- Additive diagnostics-only field.
- Process-local counters reset on cold starts/redeploys.
