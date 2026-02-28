# Feature Impact: Admin Health Response Shape ID

## Summary
Added a lightweight `responseShapeId` marker to admin health diagnostics for constrained monitoring clients that need minimal contract checks.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `ADMIN_HEALTH_RESPONSE_SHAPE_ID` constant.
  - Added top-level `responseShapeId` field.
  - Added `schemaCapabilities.responseShapeId` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (simpler contract validation for lightweight health polling clients)

## Risk Notes
- Additive metadata-only field.
- No changes to auth, checks, or mutation behavior.
