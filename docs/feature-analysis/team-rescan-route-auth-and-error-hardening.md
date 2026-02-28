# Team Rescan Route Auth + Error Hardening

## Summary
Hardened `POST /api/teams/[teamId]/rescan` with timing-safe system-token validation and standardized API error envelopes.

## Changes
- Added timing-safe cron/system token validation (`timingSafeEqual`) with fail-closed behavior.
- Replaced ad-hoc invalid-team-id/unauthorized/forbidden/not-found/manual-500 responses with `ApiErrors` + `errorResponse(...)`.
- Added structured bad-request details for invalid `teamId` params.
- Removed catch-path console logging.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
