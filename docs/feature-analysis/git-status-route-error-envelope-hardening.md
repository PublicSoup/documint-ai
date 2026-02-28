# Git Status Route Error Envelope Hardening

## Summary
Hardened `GET /api/git/status` with explicit rate limiting and standardized API error handling.

## Changes
- Added `enforceRateLimit(session.user.id, "api")`.
- Replaced manual unauthorized response with `throw ApiErrors.unauthorized()`.
- Replaced route-level `console.error` + manual 500 response with `errorResponse(error)`.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: low-medium
