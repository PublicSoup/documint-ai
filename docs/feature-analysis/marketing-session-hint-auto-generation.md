# Marketing Session Hint Auto-Generation

## Summary
Enhanced landing CTA tracking to auto-generate a persistent non-PII `sessionHint` when one is not explicitly provided.

## Implemented
- Added client-side helper in `TrackedLink` to:
  - reuse explicit `sessionHint` when passed
  - otherwise read/create a stable localStorage-backed hint (`documint:marketing-session-hint`)
- Included resolved hint in event payloads sent to `/api/analytics/marketing-event`.

## Expected Impact
- **Acquisition:** better attribution continuity across multiple CTA clicks in the same visitor session.
- **Activation:** improved funnel sequence visibility before auth.
- **Paid conversion:** cleaner pre-signup journey analysis for pricing/CTA optimization.
- **Retention:** indirect uplift from improved experiment quality.

## Risk
- Low risk; non-PII client identifier only, scoped to analytics hinting.
- Verify/commit still blocked while exec backend is unavailable.
