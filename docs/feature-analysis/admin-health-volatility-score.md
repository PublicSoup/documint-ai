# Feature Impact: Admin Health Volatility Score

## Summary
Added `healthSignalVolatilityScore` (0–100) as a numeric complement to volatility banding, enabling threshold-driven alert tuning.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `healthSignalVolatilityScore`.
  - Score combines:
    - transition utilization
    - transition velocity
    - flapping boost
  - Added `schemaCapabilities.healthSignalVolatilityScore` flag.
  - Recovery fix included in same batch: corrected calculation order to avoid pre-initialization reference during build.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (better volatility threshold tuning and early instability detection)

## Risk Notes
- Additive diagnostics-only field.
- Process-local counters reset on cold starts/redeploys.
