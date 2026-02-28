# Feature Impact: Admin Health Policy Action Digest Change Tracking

## Summary
Added first-class policy remediation-plan drift detection by tracking action digest changes independently from mismatch-state changes.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level fields:
    - `policyMismatchActionDigest`
    - `policyMismatchActionChanged`
    - `policyMismatchPreviousActionDigest`
  - Added process-local previous action digest tracking.
  - Added schema capability flags for the new fields.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (clearer remediation-plan transition visibility in ops pipelines)

## Risk Notes
- Process-local previous-digest tracking resets on cold starts/redeploys.
- Additive diagnostics-only fields.
