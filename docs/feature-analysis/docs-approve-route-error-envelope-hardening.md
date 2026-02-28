# Docs Approve Route Error Envelope Hardening

## Summary
Hardened `POST /api/docs/[id]/approve` to align with centralized API error semantics and production logging hygiene.

## Changes
- Replaced ad-hoc unauthorized/bad-request/forbidden/not-found responses with `ApiErrors` throws.
- Added structured param-validation details for invalid file IDs.
- Removed route-level console logging in post-approval async background branches.
- Kept approval transaction, notification, and GitHub sync trigger behavior intact.

## Why this matters
- Improves consistency of mutation-route failure envelopes.
- Reduces noisy production logging while preserving non-blocking behavior.
- Strengthens reliability of approval workflows under partial downstream failures.

## Estimated business impact
- Acquisition: low
- Activation: low-medium
- Paid conversion: low
- Retention: medium
