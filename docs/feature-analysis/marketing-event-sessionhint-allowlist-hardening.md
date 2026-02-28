# Marketing Event SessionHint Allowlist Hardening

## Summary
Hardened `/api/analytics/marketing-event` by constraining `sessionHint` values to approved prefix policy.

## Implemented
- Added `isAllowedSessionHintToken(...)` policy.
- Current allowlist prefix: `mh_`.
- `sessionHint` now must pass:
  - safe-character regex
  - allowlist prefix refinement

## Expected Impact
- **Acquisition:** cleaner telemetry dimensions.
- **Activation:** reduced risk of arbitrary session-hint cardinality/poisoning.
- **Paid conversion:** more reliable pre-auth funnel analytics.
- **Retention:** stronger telemetry governance and abuse resistance.

## Risk
- Low risk; existing generated hints already use `mh_` prefix.
- Verify/commit remains blocked while exec backend is unavailable.
