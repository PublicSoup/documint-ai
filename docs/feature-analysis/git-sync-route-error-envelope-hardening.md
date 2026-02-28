# Git Sync Route Error Envelope Hardening

## Summary
Hardened `POST /api/git/sync` with explicit rate limiting and standardized auth/error handling.

## Changes
- Added `enforceRateLimit(session.user.id, "api")`.
- Replaced manual unauthorized response with `throw ApiErrors.unauthorized()`.
- Replaced catch-path console logging + manual 500 response with `errorResponse(error)`.
- Preserved non-destructive sync behavior and non-blocking audit logging.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: low-medium
