# Customer Portal Route Error Envelope Hardening

## Summary
Hardened `POST /api/customer-portal` by replacing ad-hoc failure responses with centralized API errors.

## Changes
- Added `ApiErrors` + `errorResponse` usage.
- Replaced manual unauthorized response with `throw ApiErrors.unauthorized()`.
- Replaced manual missing-billing-account `400` with `ApiErrors.badRequest(...)`.
- Removed route-level console logging and manual 500 response.

## Why this matters
- Improves consistency of billing-route error envelopes.
- Reduces noisy production logging in sensitive billing flows.
- Aligns customer portal endpoint with enterprise route-hardening standards.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: medium (fewer ambiguous billing failures)
- Retention: medium
