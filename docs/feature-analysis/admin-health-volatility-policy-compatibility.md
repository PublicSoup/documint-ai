# Feature Impact: Admin Health Volatility Policy Compatibility Signal

## Summary
Added `volatilityPolicyCompatible` so monitor pipelines can quickly determine whether volatility alert policy metadata is compatible with the current contract mode.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `volatilityPolicyCompatible` boolean.
  - Current strict-mode logic verifies bundle/version alignment.
  - Added `schemaCapabilities.volatilityPolicyCompatible` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (safer monitor policy rollouts and fewer parser-policy mismatches)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
