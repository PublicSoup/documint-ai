# Feature Impact: Admin Health Contract Revision Marker

## Summary
Added a monotonic contract revision marker to admin health diagnostics so strict external monitors can pin and validate payload schema evolution safely.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `ADMIN_HEALTH_CONTRACT_REVISION` constant.
  - Added top-level `contractRevision` field in response payload.
  - Added `schemaCapabilities.contractRevision` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (safer long-term monitor compatibility and contract governance)

## Risk Notes
- Additive metadata-only change.
- No auth/mutation/runtime behavior changes.
