# Feature Impact: Admin Health Policy Action Volatility Score + Alert Recommendation

## Summary
Expanded remediation-plan drift observability with numeric volatility scoring and direct alert recommendation signals.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level fields:
    - `policyMismatchActionTransitionVelocityPerMin`
    - `policyMismatchActionVolatilityScore`
    - `policyMismatchActionAlertRecommended`
  - Added matching `schemaCapabilities` flags.
  - Alert recommendation currently triggers when action volatility is `volatile` or score is `>= 70`.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (better remediation-plan drift alerting and automation tuning)

## Risk Notes
- Process-local counters reset on cold starts/redeploys.
- Additive diagnostics-only fields; no auth/mutation/runtime behavior changes.
