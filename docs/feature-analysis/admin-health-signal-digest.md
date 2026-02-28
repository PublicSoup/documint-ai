# Feature Impact: Admin Health Signal Digest

## Summary
Added a compact deterministic `healthSignalDigest` to admin health diagnostics for snapshot-level deduplication across polling intervals.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `healthSignalDigest` (short SHA-256 derived token).
  - Digest includes key reliability signals:
    - severity
    - summary code
    - incident class
    - degraded/critical components
    - check failures
    - latency bucket
    - stale component count
    - escalation signal count
  - Added `schemaCapabilities.healthSignalDigest` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (reduced polling noise and clearer change detection in ops pipelines)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
