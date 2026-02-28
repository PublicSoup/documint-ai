# Team Reviews Route Error Envelope Hardening

## Summary
Hardened `GET /api/teams/[teamId]/reviews` by replacing ad-hoc auth/validation/forbidden/manual-500 branches with centralized API error handling.

## Changes
- Added `ApiErrors` + `errorResponse` usage.
- Replaced manual invalid-team-id response with `ApiErrors.badRequest(...)` (structured details).
- Replaced manual unauthorized/forbidden responses with `ApiErrors.unauthorized()` and `ApiErrors.forbidden()`.
- Removed catch-path console logging.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
