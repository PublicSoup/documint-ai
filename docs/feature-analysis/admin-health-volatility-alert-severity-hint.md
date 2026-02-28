# Feature Impact: Admin Health Volatility Alert Severity Hint

## Summary
Added `volatilityAlertSeverityHint` to provide direct policy mapping (`none|watch|page`) for volatility-driven incident routing.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `volatilityAlertSeverityHint`.
  - Current mapping:
    - `none` when volatility alert is not recommended
    - `watch` for recommended volatility alerts below high score threshold
    - `page` when volatility score is high (>=80)
  - Added `schemaCapabilities.volatilityAlertSeverityHint` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster and more consistent pager policy execution)

## Risk Notes
- Additive diagnostics-only field.
- Process-local volatility context resets on cold starts/redeploys.
