# Feature Impact: Admin Health Flapping Signal

## Summary
Added a threshold-based `healthSignalFlapping` signal to identify unstable oscillating health states in process-local polling windows.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added flapping thresholds:
    - transition count threshold
    - stability window threshold
  - Added top-level `healthSignalFlapping` boolean.
  - Added `schemaCapabilities.healthSignalFlapping` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster detection of unstable environments and alert storms)

## Risk Notes
- Process-local behavior resets on cold starts/redeploys.
- Additive diagnostics-only field.
