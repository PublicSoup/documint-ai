# Feature Impact: Admin Health Policy Mismatch Volatility Alert Recommendation

## Summary
Added `policyMismatchVolatilityAlertRecommended` to provide direct alert gating for policy-drift volatility states.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `policyMismatchVolatilityAlertRecommended`.
  - Current rule recommends alerting when:
    - mismatch volatility band is `volatile`, or
    - mismatch volatility score is `>= 70`.
  - Added `schemaCapabilities.policyMismatchVolatilityAlertRecommended` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster policy-drift alert decisions, reduced monitor rule complexity)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
