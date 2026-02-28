# Inline Comments Route Error-Path Hardening

## Summary
Hardened `GET/POST /api/comments/inline` by normalizing inline error responses to thrown `ApiErrors` and tightening ID input constraints.

## Changes
- Replaced inline `return errorResponse(ApiErrors...)` branches with throws for:
  - unauthorized
  - forbidden access
  - missing file
  - invalid parent comment reference
- Tightened schema constraints for `fileId` and `parentId` (`trim`, `max 100`).

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
