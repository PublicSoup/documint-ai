# Team Invite Revoke Error Envelope Hardening

## Summary
Hardened `DELETE /api/teams/invite/revoke` to use centralized query validation and standardized API error envelopes.

## Changes
- Replaced ad-hoc query parsing with `validateQuery(...)`.
- Replaced manual unauthorized/forbidden/not-found responses with `ApiErrors`.
- Replaced custom catch handling with shared `errorResponse(...)`.
- Preserved rate-limit enforcement, permission checks, and audit logging behavior.

## Why this matters
- Improves consistency and predictability for invite revocation errors.
- Reduces route-specific response drift in team mutation paths.
- Strengthens enterprise reliability in collaboration management flows.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
