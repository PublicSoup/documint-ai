# Feature Impact: Admin Health Volatility Band

## Summary
Added `healthSignalVolatilityBand` to admin health diagnostics for quick dashboard interpretation of signal stability risk.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `healthSignalVolatilityBand` with values:
    - `stable`
    - `watch`
    - `volatile`
  - Band derives from transition count and flapping status.
  - Added `schemaCapabilities.healthSignalVolatilityBand` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster operational interpretation of instability risk)

## Risk Notes
- Additive diagnostics-only field.
- Process-local volatility context resets on cold starts/redeploys.
