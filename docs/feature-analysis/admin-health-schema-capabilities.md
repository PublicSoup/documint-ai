# Feature Impact: Admin Health Schema Capabilities

## Summary
Added explicit schema capability flags to admin health responses so dashboards can safely detect and gate optional diagnostics fields.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `schemaCapabilities` object.
  - Capability flags include:
    - `degradedComponents`
    - `componentSeverity`
    - `recommendedActions`
    - `runbookUrls`
    - `webContainerSnapshot`
    - `webContainerThresholdSignals`

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (safer ops dashboard evolution, reduced parser brittleness)

## Risk Notes
- Additive metadata only; no behavior changes.
- Backward compatible for existing health consumers.
