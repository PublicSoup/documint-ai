# Team Security Route Error-Path Normalization

## Summary
Hardened `GET /api/teams/[teamId]/security` by normalizing inline `errorResponse(ApiErrors...)` branches to thrown `ApiErrors` with centralized catch handling.

## Changes
- Replaced inline error responses with throws for:
  - unauthorized
  - invalid team id
  - forbidden access
- Added structured validation details for invalid `teamId` params via `parsedParams.error.flatten()`.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: medium
