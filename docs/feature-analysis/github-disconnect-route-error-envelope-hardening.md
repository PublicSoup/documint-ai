# GitHub Disconnect Route Error Envelope Hardening

## Summary
Hardened `POST /api/github/disconnect` by standardizing auth/not-found error flow and cleaning handler signature hygiene.

## Changes
- Replaced inline unauthorized response with `throw ApiErrors.unauthorized()`.
- Replaced inline missing-connection response with `throw ApiErrors.notFound(...)`.
- Removed unused request parameter/import (`NextRequest`) from handler.
- Preserved existing rate limit, delete flow, and non-blocking audit logging.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
