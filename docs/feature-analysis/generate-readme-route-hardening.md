# Generate README Route Hardening

## Summary
Hardened `POST /api/generate-readme` with strict request validation, explicit rate limiting, and standardized API error envelopes.

## Changes
- Added strict zod schema for request body (`fileIds` + nested `options`).
- Added rate limiting via `enforceRateLimit(session.user.id, "pro")`.
- Replaced ad-hoc unauthorized/not-found/manual-500 responses with `ApiErrors` + `errorResponse(...)`.
- Removed production console logging from AI fallback path and route catch block.

## Why this matters
- Prevents malformed option payloads from reaching generation logic.
- Aligns route behavior with enterprise mutation/read hardening standards.
- Improves reliability and consistency for client-side error handling.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low-medium
- Retention: medium
