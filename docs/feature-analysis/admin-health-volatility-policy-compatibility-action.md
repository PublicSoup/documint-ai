# Feature Impact: Admin Health Volatility Policy Compatibility Action

## Summary
Added `volatilityPolicyCompatibilityAction` to provide direct remediation routing when policy compatibility checks fail.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `volatilityPolicyCompatibilityAction` values:
    - `no-action`
    - `verify-bundle-config`
    - `update-monitor-policy`
  - Action is derived from `volatilityPolicyCompatibilityReason`.
  - Added `schemaCapabilities.volatilityPolicyCompatibilityAction` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster remediation routing for monitor policy mismatches)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
