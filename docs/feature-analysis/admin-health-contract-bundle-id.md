# Feature Impact: Admin Health Contract Bundle ID

## Summary
Added a compact `contractBundleId` token combining revision, shape, and compatibility mode for one-token monitor pinning.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `contractBundleId`.
  - Composed from:
    - `contractRevision`
    - `responseShapeId`
    - `contractCompatibilityMode`
  - Added `schemaCapabilities.contractBundleId` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (simpler external contract pinning and drift detection)

## Risk Notes
- Additive metadata-only field.
- No auth/mutation/runtime behavior changes.
