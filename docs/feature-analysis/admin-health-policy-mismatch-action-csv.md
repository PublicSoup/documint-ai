# Feature Impact: Admin Health Policy Mismatch Action CSV

## Summary
Added `policyMismatchRecommendedActionCsv` so legacy alerting systems can route remediation actions for policy mismatches without object/array parsing.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added derived `policyMismatchRecommendedActions` list from mismatch names.
  - Added top-level `policyMismatchRecommendedActionCsv` (`none` when empty).
  - Added `schemaCapabilities.policyMismatchRecommendedActionCsv` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster remediation routing in compact monitor pipelines)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
