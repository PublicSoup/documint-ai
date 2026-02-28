# Feature Impact: Admin Health No-Store + Latency Signal

## Summary
Improved admin health diagnostics by adding a check-duration metric and disabling cache for `/api/admin/health` responses.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added `checkDurationMs` to response payload for latency visibility.
  - Added `Cache-Control: no-store, max-age=0` to ensure fresh health diagnostics in admin tooling.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (faster detection of degraded admin/runtime conditions)

## Risk Notes
- Backward compatible (additive fields/headers).
- No auth/rate-limit semantics changed.
