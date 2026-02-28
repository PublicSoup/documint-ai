# GitHub Repo Pulls Route Hardening

## Summary
Hardened `GET /api/github/repos/pulls` with standardized error handling and safer credential-path behavior.

## Changes
- Replaced inline unauthorized response with `throw ApiErrors.unauthorized()`.
- Switched query parsing to `req.nextUrl.searchParams` + `validateQuery(...)`.
- Replaced token-decrypt console logging path with thrown internal error.
- Standardized upstream GitHub failure mapping:
  - `401` -> unauthorized token error
  - non-401 failures -> `serviceUnavailable("GitHub API")`
- Kept existing rate limiting and success payload contract.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
