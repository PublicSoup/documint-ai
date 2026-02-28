# Contact + Refund Route Reliability Fix

## Summary
Resolved two broken public navigation targets from the landing experience by adding first-class pages for `/contact` and `/refund`.

## Problem
Landing CTAs and footer links pointed to routes that were not implemented, causing 404 dead-ends and degrading conversion and trust.

## Shipped
- Added `src/app/contact/page.tsx`
- Added `src/app/refund/page.tsx`

## Outcome
- Contact Sales CTA now lands on an actionable page with direct enterprise contact paths.
- Refund Policy footer link now resolves to a real legal destination.
- Reduced conversion friction and legal/trust dead-ends in top-of-funnel UX.

## Estimated business impact
- Acquisition: medium
- Activation: medium
- Paid conversion: medium-high
- Retention: medium
