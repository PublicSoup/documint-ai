# Search Route Error Envelope Hardening

## Summary
Hardened `GET /api/search` by replacing ad-hoc auth/query/error handling with centralized API utilities.

## Changes
- Added `validateQuery(...)` for strict query parsing.
- Replaced manual unauthorized/invalid-query branches with `ApiErrors`.
- Replaced route-level catch + console logging with `errorResponse(...)`.
- Kept search behavior and result schema unchanged.

## Why this matters
- Improves consistency of API failure envelopes.
- Removes route-specific logging noise while preserving malformed-doc tolerance.
- Aligns search endpoint with enterprise reliability standards.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low
- Retention: medium
