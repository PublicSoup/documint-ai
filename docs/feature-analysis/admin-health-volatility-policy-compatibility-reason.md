# Feature Impact: Admin Health Volatility Policy Compatibility Reason

## Summary
Added `volatilityPolicyCompatibilityReason` to explain policy compatibility outcomes directly in admin health diagnostics.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `volatilityPolicyCompatibilityReason`.
  - Current values:
    - `compatible`
    - `missing-policy-version-in-bundle`
    - `contract-mode-not-strict`
  - Added `schemaCapabilities.volatilityPolicyCompatibilityReason` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster monitor/debug triage for policy mismatches)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
