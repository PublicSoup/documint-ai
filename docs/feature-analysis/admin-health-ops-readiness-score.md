# Feature Impact: Admin Health Ops Readiness Score

## Summary
Added an `opsReadinessScore` (0–100) to admin health diagnostics for a compact executive signal of operational readiness.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `opsReadinessScore`.
  - Score factors:
    - severity (`critical`/`degraded` penalties)
    - stale component count penalty
    - latency bucket penalty
  - Added `schemaCapabilities.opsReadinessScore`.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium-High (faster high-level ops visibility and trend tracking)

## Risk Notes
- Additive diagnostics-only field.
- Scoring weights are heuristic and can be tuned with production data.
