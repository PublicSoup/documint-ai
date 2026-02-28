# Subscription API Fallback Mask Removal

## Summary
Hardened `GET /api/user/subscription` by removing catch-block fallback masking and switching to standardized API error envelopes.

## Changes
- Removed ad-hoc fallback response with synthetic `error` field from catch path.
- Removed server-side `console.error` from API handler.
- Route now returns errors via `errorResponse(...)`.

## Why this matters
- Prevents hidden failures from being reported as successful fallback states.
- Aligns subscription endpoint behavior with enterprise API error standards.
- Improves reliability and debugging clarity for client flows.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low (indirect)
- Retention: medium (billing/plan trust)
