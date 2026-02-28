# Feature Impact: Admin Health Policy Mismatch Transition Velocity

## Summary
Added policy mismatch transition count + velocity metrics to align mismatch drift observability with existing health-signal volatility diagnostics.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `policyMismatchTransitionCount`.
  - Added top-level `policyMismatchTransitionVelocityPerMin`.
  - Added schema capability flags:
    - `policyMismatchTransitionCount`
    - `policyMismatchTransitionVelocityPerMin`

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (better policy drift trend tuning and alert calibration)

## Risk Notes
- Process-local transition tracking resets on cold starts/redeploys.
- Additive diagnostics-only fields.
