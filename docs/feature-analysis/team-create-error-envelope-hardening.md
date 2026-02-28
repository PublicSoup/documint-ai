# Team Create Error Envelope Hardening

## Summary
Hardened `POST /api/teams/create` to use centralized validation and standardized error envelopes.

## Changes
- Added shared API utilities:
  - `validateBody(...)` for request payload validation
  - `ApiErrors` + `errorResponse(...)` for failure handling
- Replaced ad-hoc unauthorized and bad-request responses.
- Replaced custom rate-limit/manual catch branching with standardized envelope flow.
- Preserved slug conflict handling with explicit conflict mapping.

## Why this matters
- Improves consistency across mutation-route error semantics.
- Reduces divergence in auth/validation behavior.
- Keeps team creation endpoint aligned with enterprise hardening standards.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low (indirect)
- Retention: medium (reliability consistency)
