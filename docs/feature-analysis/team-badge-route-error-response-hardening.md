# Team Badge Route Error Response Hardening

## Summary
Hardened `GET /api/teams/[teamId]/badge` error-path behavior for reliability and response consistency.

## Changes
- Added shared `textResponse(...)` helper for non-SVG error responses.
- Standardized 400/404/500 badge errors to return:
  - `Content-Type: text/plain; charset=utf-8`
  - `Cache-Control: no-store`
- Removed route-level console logging from catch path.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low
- Retention: low-medium
