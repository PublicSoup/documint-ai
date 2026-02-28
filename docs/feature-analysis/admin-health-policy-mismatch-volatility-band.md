# Feature Impact: Admin Health Policy Mismatch Volatility Band

## Summary
Added `policyMismatchVolatilityBand` to classify policy compatibility drift risk (`stable|watch|volatile`) using process-local transition behavior.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added process-local `policyMismatchTransitionCount`.
  - Added top-level `policyMismatchVolatilityBand` based on transition thresholds.
  - Added `schemaCapabilities.policyMismatchVolatilityBand` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (faster policy drift risk triage for monitor governance)

## Risk Notes
- Process-local transition tracking resets on cold starts/redeploys.
- Additive diagnostics-only fields.
