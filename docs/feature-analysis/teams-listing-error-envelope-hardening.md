# Teams Listing Error Envelope Hardening

## Summary
Hardened `GET /api/teams` to use centralized unauthorized handling instead of ad-hoc JSON response construction.

## Change
- Replaced manual 401 response with `ApiErrors.unauthorized()`.
- Route now consistently flows through shared `errorResponse` handling.

## Why this matters
- Improves consistency of API error envelopes across team endpoints.
- Reduces divergence in auth-failure behavior and simplifies client error handling.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect)
- Retention: low-medium (API reliability consistency)
