# Public Docs Route Launch

## Summary
Introduced a public `/docs` route to eliminate a broken footer path and provide immediate onboarding guidance for new visitors.

## What shipped
- New route: `src/app/docs/page.tsx`
- Three high-intent entry paths:
  - Getting Started (`/auth/register?...`)
  - Web IDE (`/code`)
  - Security/Compliance path (`/dashboard/settings`)
- Final CTA block for free trial conversion + navigation fallback to home.

## Why this matters
- Removes dead-end navigation from the landing footer.
- Gives first-time visitors a structured, low-friction onboarding path.
- Improves trust by surfacing security orientation before signup.

## Estimated business impact
- Acquisition: **medium positive** (better crawlable documentation destination)
- Activation: **high positive** (clear setup and first-action pathways)
- Paid conversion: **medium positive** (trial CTA in docs context)
- Retention: **low-medium positive** (stronger expectation setting before usage)
