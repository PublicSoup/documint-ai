# Feature Impact: Admin Health Policy Mismatch Volatility Alert Severity Hint

## Summary
Added `policyMismatchVolatilityAlertSeverityHint` to provide direct pager policy mapping (`none|watch|page`) for policy-drift volatility states.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `policyMismatchVolatilityAlertSeverityHint`.
  - Current mapping:
    - `none` when mismatch volatility alert is not recommended
    - `watch` for recommended alerts below high score threshold
    - `page` when mismatch volatility score is high (`>= 85`)
  - Added `schemaCapabilities.policyMismatchVolatilityAlertSeverityHint` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster policy-drift escalation routing and clearer operational actioning)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
