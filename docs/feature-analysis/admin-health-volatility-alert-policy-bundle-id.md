# Feature Impact: Admin Health Volatility Alert Policy Bundle ID

## Summary
Added `volatilityAlertPolicyBundleId` for one-token pinning of volatility alert semantics (policy version + policy mode).

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added constant `ADMIN_HEALTH_VOLATILITY_ALERT_POLICY_MODE`.
  - Added top-level `volatilityAlertPolicyBundleId` composed from:
    - `volatilityAlertPolicyVersion`
    - policy mode
  - Added `schemaCapabilities.volatilityAlertPolicyBundleId` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (safer monitor policy pinning and migration coordination)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
