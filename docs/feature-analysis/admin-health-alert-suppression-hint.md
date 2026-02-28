# Feature Impact: Admin Health Alert Suppression Hint

## Summary
Added an explicit suppression hint for non-production, non-actionable degraded states to reduce noisy paging from expected fallback conditions.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `alertSuppressionHint`.
  - Current logic emits `suppress-nonprod-ratelimit` when:
    - environment is non-production, and
    - summary code is `DEGRADED_RATELIMIT`.
  - Emits `none` otherwise.
  - Added `schemaCapabilities.alertSuppressionHint` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (better signal-to-noise in ops alerts; faster focus on true incidents)

## Risk Notes
- Additive diagnostics field only.
- Suppression is advisory metadata; no checks are skipped.
