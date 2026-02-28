# Feature Impact: Admin Health Policy Action Volatility Band

## Summary
Added remediation-plan transition count and volatility band signals so policy action drift can be triaged similarly to mismatch-state volatility.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added process-local `policyMismatchActionTransitionCount`.
  - Added top-level `policyMismatchActionVolatilityBand` (`stable|watch|volatile`).
  - Added schema capability flags:
    - `policyMismatchActionTransitionCount`
    - `policyMismatchActionVolatilityBand`

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (improved remediation-plan stability governance)

## Risk Notes
- Process-local counters reset on cold starts/redeploys.
- Additive diagnostics-only fields.
