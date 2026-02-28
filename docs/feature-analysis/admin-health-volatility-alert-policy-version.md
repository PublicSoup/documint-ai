# Feature Impact: Admin Health Volatility Alert Policy Version

## Summary
Added `volatilityAlertPolicyVersion` so monitoring pipelines can pin volatility alert interpretation logic to an explicit policy version.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added constant `ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_VERSION`.
  - Added top-level `volatilityAlertPolicyVersion` in response payload.
  - Added `schemaCapabilities.volatilityAlertPolicyVersion` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (safer policy evolution for alert routing without parser ambiguity)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
