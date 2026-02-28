# Feature Impact: Admin Health Flapping Reason

## Summary
Added `healthSignalFlappingReason` so operators can understand whether flapping status is driven by transition volume, stability-window recency, or both.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added derived `healthSignalFlappingReason` enum:
    - `transition-threshold-and-stability-window`
    - `transition-threshold-only`
    - `stability-window-only`
    - `none`
  - Added `schemaCapabilities.healthSignalFlappingReason` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster diagnosis of unstable state patterns)

## Risk Notes
- Additive diagnostics-only field.
- Process-local flapping context resets on cold starts/redeploys.
