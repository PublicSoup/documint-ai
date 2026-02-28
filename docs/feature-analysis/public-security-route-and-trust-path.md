# Public Security Route + Trust Path Hardening

## Summary
Added a public `/security` page and rewired trust-related UX paths to avoid auth-gated dead ends during pre-signup evaluation.

## Shipped
- New route: `src/app/security/page.tsx`
- Updated `/docs` Security + Compliance card link:
  - from `/dashboard/settings` (auth-gated)
  - to `/security` (public trust content)
- Updated `/contact` Security reviews section to point to `/security`.

## Why this matters
- Improves reliability of trust/navigation flows for anonymous and early-stage evaluators.
- Reduces conversion friction from gated pages in top-of-funnel security discovery.
- Strengthens enterprise buyer confidence with a dedicated security destination.

## Estimated business impact
- Acquisition: medium
- Activation: medium
- Paid conversion: medium-high
- Retention: low-medium
