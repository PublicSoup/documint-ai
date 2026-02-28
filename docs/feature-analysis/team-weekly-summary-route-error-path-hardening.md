# Team Weekly Summary Route Error-Path Hardening

## Summary
Hardened `GET /api/teams/[teamId]/weekly-summary` by normalizing ad-hoc inline error responses to centralized `ApiErrors` flow.

## Changes
- Added `validateQuery(...)` usage for `days` parameter via `request.nextUrl.searchParams`.
- Replaced inline `errorResponse(ApiErrors...)` branches with throws for:
  - unauthorized
  - invalid team id
  - forbidden access
- Added structured validation detail for invalid `teamId` params.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: medium
