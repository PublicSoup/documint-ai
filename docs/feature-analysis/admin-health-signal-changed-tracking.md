# Feature Impact: Admin Health Signal Change Tracking

## Summary
Added change-tracking metadata to admin health diagnostics so pollers can immediately detect state transitions without recomputing diffs externally.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added in-memory previous-snapshot tracking for `healthSignalDigest`.
  - Added top-level fields:
    - `healthSignalChanged`
    - `healthSignalPreviousDigest`
    - `healthSignalPreviousObservedAt`
  - Added schema capability flags for all three fields.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster incident state-change detection and lower polling compute)

## Risk Notes
- Process-local memory tracking (resets on cold start/redeploy).
- Additive diagnostics-only fields; no auth/mutation/runtime behavior changes.
