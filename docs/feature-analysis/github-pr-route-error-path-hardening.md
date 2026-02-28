# GitHub PR Route Error-Path Hardening

## Summary
Hardened `POST /api/github/pr` by normalizing mixed inline error-response branches to thrown `ApiErrors` and removing credential-path console logging.

## Changes
- Replaced inline `errorResponse(ApiErrors...)` returns with `throw ApiErrors...` for:
  - unauthorized session
  - missing GitHub connection
  - decrypt failure
  - missing documentation
  - forbidden file export scope
- Removed token-decrypt console logging in the credential path.

## Why this matters
- Keeps route behavior aligned with centralized catch/error-envelope handling.
- Reduces sensitive-path log noise while preserving deterministic API responses.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
