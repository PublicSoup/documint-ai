# Feature Impact: Admin Health Policy Mismatch CSV

## Summary
Added `policyMismatchNamesCsv` to admin health diagnostics for compact mismatch routing in legacy monitor pipelines.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added derived `policyMismatches` list.
  - Added top-level `policyMismatchNamesCsv` (`none` when empty).
  - Updated `policyMismatchCount` to derive from list length.
  - Added `schemaCapabilities.policyMismatchNamesCsv` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (simpler multi-policy mismatch parsing as checks expand)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
