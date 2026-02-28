# Teams Listing Data Minimization Hardening

## Summary
Hardened `GET /api/teams` query shape to fetch only required fields for members and invites.

## Changes
- Replaced broad `include` loading with explicit `select` for:
  - team members (`userId`, `role`, user profile subset)
  - invites (`id`, `email`, `role`, `createdAt`)
- Avoids pulling unnecessary fields during team listing hydration.

## Why this matters
- Reduces accidental exposure risk for sensitive invite attributes in application memory.
- Improves response-path efficiency and keeps data access least-privileged.
- Supports enterprise data-minimization posture on read endpoints.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect trust signal)
- Retention: low-medium
