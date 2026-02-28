# Reviews Route Error Envelope Hardening

## Summary
Hardened `GET/POST /api/reviews` with centralized validation, explicit rate limiting, and standardized API error handling.

## Changes
- Added `enforceRateLimit(session.user.id, "api")` to both handlers.
- Replaced ad-hoc unauthorized/validation/not-found/forbidden/manual-500 responses with `ApiErrors` + `errorResponse(...)`.
- Replaced manual JSON parse/safeParse with `validateBody(req, createReviewSchema)`.
- Tightened input normalization/constraints for IDs and comments.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
