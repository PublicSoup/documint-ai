# Feature Impact: Admin Health Stale Component Count

## Summary
Added a bounded stale component counter to admin health diagnostics so monitors can quickly detect lagging or missing subsystem check timestamps.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `staleComponentCount` top-level field.
  - Uses `COMPONENT_STALE_THRESHOLD_MS` (5s) and per-component timestamps.
  - Counts components with missing/invalid timestamps or stale check times.
  - Added `schemaCapabilities.staleComponentCount` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (faster detection of degraded diagnostics freshness)

## Risk Notes
- Additive diagnostics-only field.
- No mutation/auth/rate-limit behavior changes.
