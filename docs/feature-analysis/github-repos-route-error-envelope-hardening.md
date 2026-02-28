# GitHub Repos Route Error Envelope Hardening

## Summary
Hardened `GET /api/github/repos` with centralized error semantics and cleaner failure-path handling.

## Changes
- Replaced inline unauthorized response with `throw ApiErrors.unauthorized()`.
- Switched query parsing to `req.nextUrl.searchParams` + `validateQuery(...)`.
- Replaced token-decrypt console logging path with standardized thrown internal error.
- Replaced ad-hoc GitHub upstream failure JSON response with standardized `ApiErrors` mapping:
  - `401` → unauthorized (invalid/expired token)
  - non-401 upstream failures → `serviceUnavailable("GitHub API")`

## Why this matters
- Keeps GitHub integration routes aligned with enterprise error-envelope standards.
- Removes noisy logging from sensitive credential/decrypt path.
- Improves reliability and client handling consistency for upstream failures.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
