# Team Invite Route Error Envelope Hardening

## Summary
Hardened `POST /api/teams/invite` to use centralized validation and standardized API error envelopes while preserving invite semantics.

## Changes
- Replaced manual request parsing with `validateBody(..., inviteSchema)`.
- Replaced ad-hoc unauthorized/forbidden/not-found/conflict responses with `ApiErrors`.
- Replaced custom catch fallback responses with centralized `errorResponse(...)`.
- Preserved duplicate-invite conflict mapping for Prisma unique constraint races.

## Why this matters
- Improves consistency of mutation-route error behavior.
- Reduces response-shape drift and client-side ambiguity.
- Strengthens enterprise reliability posture for team collaboration flows.

## Estimated business impact
- Acquisition: low
- Activation: medium
- Paid conversion: low-medium
- Retention: medium
