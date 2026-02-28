# Team Health Report Route Hardening

## Summary
Hardened `POST /api/teams/[teamId]/health-report` with timing-safe system-token validation and standardized API error envelopes.

## Changes
- Added timing-safe system auth verification (`timingSafeEqual`) with fail-closed behavior.
- Replaced ad-hoc invalid-id/unauthorized/forbidden/not-found/manual-500 responses with `ApiErrors` + `errorResponse(...)`.
- Added structured bad-request details for invalid `teamId` params.
- Removed route-level console logging from notification/audit/fatal catch paths (kept non-blocking behavior).

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
