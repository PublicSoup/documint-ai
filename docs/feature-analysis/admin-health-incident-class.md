# Feature Impact: Admin Health Incident Class

## Summary
Added a deterministic `incidentClass` field to admin health diagnostics so paging and routing systems can classify incidents without custom rule trees.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `incidentClass` with values:
    - `none`
    - `availability`
    - `integrity`
    - `runtime`
    - `throttling`
    - `operations`
  - Added `schemaCapabilities.incidentClass` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster automated routing to the right responder group)

## Risk Notes
- Additive diagnostics-only field.
- No behavior changes to auth, health logic, or mutation paths.
