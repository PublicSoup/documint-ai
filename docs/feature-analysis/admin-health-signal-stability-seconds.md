# Feature Impact: Admin Health Signal Stability Seconds

## Summary
Added signal stability metadata so monitoring systems can see how long the current health signal state has remained unchanged.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added process-local stability tracking for health signal digest.
  - Added top-level fields:
    - `healthSignalStableSince`
    - `healthSignalStabilitySec`
  - Added schema capability flags for both fields.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (improved trend confidence and reduced false urgency on stable degraded states)

## Risk Notes
- Process-local memory tracking resets on cold starts/redeploys.
- Additive diagnostics-only fields.
