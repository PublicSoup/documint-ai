# Feature Impact: Admin Health Check Failure Count

## Summary
Added a compact `checkFailureCount` metric to admin health diagnostics for lightweight reliability monitoring without array parsing.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `checkFailureCount` derived from unique `checkFailures`.
  - Added `schemaCapabilities.checkFailureCount` flag.
  - Minor internal timing polish: `checkDurationMs` now computed once and reused.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster monitor thresholding and cleaner reliability dashboards)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
