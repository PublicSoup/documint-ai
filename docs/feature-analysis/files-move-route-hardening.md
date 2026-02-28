# Files Move Route Hardening

## Summary
Hardened `POST /api/files/move` with centralized validation/error handling and explicit rate limiting.

## Changes
- Added `enforceRateLimit(session.user.id, "api")`.
- Replaced manual payload parsing with `validateBody(req, moveSchema)`.
- Replaced ad-hoc unauthorized/forbidden/not-found/conflict/manual-500 responses with `ApiErrors` + `errorResponse(...)`.
- Tightened `fileId` bounds (`trim`, `max 100`).
- Removed catch-path console logging.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
