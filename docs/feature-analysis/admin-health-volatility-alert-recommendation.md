# Feature Impact: Admin Health Volatility Alert Recommendation

## Summary
Added `volatilityAlertRecommended` to admin health diagnostics so monitors can gate noisy volatility alerts using both band severity and trend confidence.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `volatilityAlertRecommended`.
  - Current logic recommends alerting when:
    - `healthSignalVolatilityBand === "volatile"`
    - `volatilityTrendConfidence !== "low"`
  - Added `schemaCapabilities.volatilityAlertRecommended` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (reduced false-positive volatility paging and clearer alert gating)

## Risk Notes
- Additive diagnostics-only field.
- Process-local trend/confidence context resets on cold starts/redeploys.
