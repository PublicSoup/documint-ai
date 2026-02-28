# Feature Impact: Admin Health Check Failure CSV

## Summary
Added `checkFailureNamesCsv` to admin health diagnostics for legacy monitor systems that prefer compact CSV fields over arrays.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `checkFailureNamesCsv` from unique check failures.
  - Added `schemaCapabilities.checkFailureNamesCsv` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (improved compatibility with legacy alert parsers)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
