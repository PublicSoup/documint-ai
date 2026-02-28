# Comments Route Error-Path Hardening

## Summary
Hardened `POST/GET/PATCH/DELETE /api/comments` by normalizing inline `errorResponse(ApiErrors...)` branches to thrown `ApiErrors` and tightening ID constraints.

## Changes
- Replaced inline error-response returns with throws across all handlers for:
  - unauthorized
  - forbidden access
  - file/comment not found
  - invalid parent-comment reference
- Tightened schema constraints for IDs (`fileId`, `parentId`, `id`) with `trim` + `max(100)`.
- Switched query parsing from `new URL(req.url).searchParams` to `req.nextUrl.searchParams`.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
