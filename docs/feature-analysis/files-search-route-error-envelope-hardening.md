# Files Search Route Error Envelope Hardening

## Summary
Hardened `GET /api/files/search` by replacing ad-hoc auth/query/error handling with centralized API utilities.

## Changes
- Added `ApiErrors`, `validateQuery`, and `errorResponse` usage.
- Replaced manual unauthorized/invalid-query/forbidden responses with standardized error throws.
- Switched query parsing from `new URL(req.url)` + `safeParse` to `validateQuery(req.nextUrl.searchParams, schema)`.
- Removed catch-path `console.error` and manual 500 response.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
