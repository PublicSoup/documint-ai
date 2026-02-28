# Marketing Event Location Token Hardening

## Summary
Hardened marketing event ingestion by enforcing a strict token format for `location` values.

## Implemented
- Updated `/api/analytics/marketing-event` schema:
  - `location` must now match `^[a-z0-9_\-]+$`
  - rejects malformed or free-form location strings

## Expected Impact
- **Acquisition:** cleaner top-of-funnel analytics dimensions.
- **Activation:** easier aggregation and charting of CTA paths.
- **Paid conversion:** better reliability for variant/location attribution near pricing and signup.
- **Retention:** indirect; improved experiment data quality supports better product decisions.

## Risk
- Low risk validation tightening; existing tracked locations already conform.
- Verify/commit still blocked until exec backend is restored.
