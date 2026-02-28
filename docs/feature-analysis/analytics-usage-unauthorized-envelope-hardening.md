# Analytics Usage Unauthorized Envelope Hardening

## Summary
Hardened `GET /api/analytics/usage` unauthorized handling to use centralized API error utilities.

## Change
- Replaced manual `401` JSON response with `ApiErrors.unauthorized()`.
- Endpoint now relies on shared `errorResponse(...)` for failure envelope consistency.

## Why this matters
- Keeps analytics endpoints aligned with standardized auth-failure semantics.
- Reduces response-shape drift for client error handling.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect)
- Retention: low-medium
