# Feature Impact: Admin Health Policy Mismatch Count

## Summary
Added `policyMismatchCount` to admin health diagnostics for threshold-based policy compatibility alerting without parsing reason/action fields.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `policyMismatchCount`.
  - Current value is derived from volatility policy compatibility (`0` or `1`).
  - Added `schemaCapabilities.policyMismatchCount` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (simpler compatibility drift thresholding in monitor pipelines)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
