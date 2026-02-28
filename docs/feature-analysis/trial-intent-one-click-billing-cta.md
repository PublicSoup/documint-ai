# Feature Impact: Trial-Intent One-Click Billing CTA

## Summary
Added a one-click trial start CTA in the billing trial-intent banner so users with a preselected plan can start checkout immediately without scanning plan cards.

## Technical Changes
- `src/app/dashboard/billing/page.tsx`
  - Trial-intent banner now renders a primary CTA when `focusedPlanId` is present.
  - CTA uses existing `handleUpgrade(planId)` checkout path.
  - CTA state is upgrade-aware (`isLoading`) and disabled when the focused plan is already active.

## Business Impact Estimate
- Acquisition: **Low** — post-auth billing stage only.
- Activation: **Medium** — reduces first billing decision latency for trial traffic.
- Paid conversion: **High** — one-click progression to checkout from intent banner removes an extra step.
- Retention: **Medium** — faster successful upgrade flow improves early-product commitment.

## Risk Notes
- Reuses existing checkout flow and guards; no billing backend changes.
- Uses already-validated plan context from query parsing.
