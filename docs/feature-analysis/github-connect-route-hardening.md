# GitHub Connect Route Hardening

## Summary
Hardened `GET /api/github/connect` with standardized error handling and explicit rate limiting.

## Changes
- Added `enforceRateLimit(session.user.id, "api")` for OAuth connect initiation.
- Replaced ad-hoc unauthorized/config-error responses with `ApiErrors`.
- Added centralized try/catch with `errorResponse(...)`.

## Why this matters
- Improves consistency of OAuth-connect failure envelopes.
- Adds abuse protection to repeated connect-initiation requests.
- Aligns GitHub integration entrypoint with enterprise API hardening standards.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
