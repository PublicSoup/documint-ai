# Usage API Error Envelope Hardening

## Summary
Hardened `GET /api/usage` by removing ad-hoc fallback payload masking and routing all failures through the standardized API error envelope.

## Changes
- Unauthorized path now throws `ApiErrors.unauthorized()`.
- Removed `console.error` from server API path.
- Removed mock-like fallback response payload on exceptions.
- All errors now return via `errorResponse(...)`.

## Why this matters
- Prevents silent failure masking and misleading plan/usage data.
- Improves consistency with enterprise API error standards.
- Strengthens observability by making failures explicit to clients.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low (indirect)
- Retention: medium (data trust + reliability)
