# Feature Impact: Admin Health Response Source Attribution

## Summary
Added source attribution metadata to admin health diagnostics so multi-environment monitoring can identify which service/runtime produced each health payload.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `responseGeneratedBy` object with:
    - `service`
    - `endpoint`
    - `environment`
    - `runtime`
  - Added `schemaCapabilities.responseGeneratedBy` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (cleaner ops attribution and easier environment-level debugging)

## Risk Notes
- Additive metadata-only change.
- No behavior changes in health checks, auth, or rate limiting.
