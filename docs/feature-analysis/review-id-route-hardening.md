# Review ID Route Hardening

## Summary
Hardened `PUT /api/reviews/[id]` with centralized validation/error handling and explicit rate limiting.

## Changes
- Added `enforceRateLimit(session.user.id, "api")`.
- Added strict review-id param validation (`trim`, bounded length) with structured bad-request details.
- Replaced manual JSON parse/safeParse with `validateBody(req, updateReviewSchema)`.
- Replaced ad-hoc unauthorized/forbidden/not-found/manual-500 responses with `ApiErrors` + `errorResponse(...)`.
- Removed catch-path console logging.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
