# Feature Impact: Admin Health Policy Mismatch Volatility Score

## Summary
Added `policyMismatchVolatilityScore` (0–100) to provide threshold-friendly numeric policy-drift risk alongside the mismatch volatility band.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `policyMismatchVolatilityScore`.
  - Score combines mismatch transition velocity and transition count.
  - Added `schemaCapabilities.policyMismatchVolatilityScore`.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (better mismatch drift alert tuning and incident prioritization)

## Risk Notes
- Process-local counters reset on cold starts/redeploys.
- Additive diagnostics-only field.
