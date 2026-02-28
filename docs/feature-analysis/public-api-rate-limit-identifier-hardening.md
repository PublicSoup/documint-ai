# Public API Rate-Limit Identifier Hardening

## Summary
Hardened `POST /api/v1/analyze` rate-limiter identity to avoid using raw API key material as the limiter key.

## Change
- Replaced limiter identifier:
  - from: `v1:${apiKey}`
  - to: `v1-user:${userId}`

## Why this matters
- Prevents API key strings from being used in rate-limit storage identifiers.
- Reduces sensitive token propagation across observability/storage surfaces.
- Keeps throttling semantics stable per authenticated API owner.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: medium (security trust)
