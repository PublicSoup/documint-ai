# Team Health Data Route Error-Path Normalization

## Summary
Hardened `GET /api/teams/[teamId]/health-data` by normalizing ad-hoc inline `errorResponse(ApiErrors...)` branches to thrown `ApiErrors` with centralized catch handling.

## Changes
- Replaced inline error responses with throws for:
  - unauthorized
  - invalid team id
  - forbidden access
  - team not found
- Added structured validation details for invalid team-id params.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: medium
