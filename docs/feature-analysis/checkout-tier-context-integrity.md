# Feature Impact: Checkout Tier/Context Integrity Guard

## Summary
Added an API-level integrity guard so checkout context cannot report a different plan than the requested tier, preventing attribution drift and inconsistent post-checkout routing.

## Technical Changes
- `src/app/api/checkout/route.ts`
  - Rejects requests where `context.plan` does not match `tier` with `400 Bad Request`.
  - Defaults metadata/audit `plan` to the actual requested `tier` when context plan is omitted.
- `src/app/dashboard/billing/page.tsx`
  - Checkout request now always sends `plan: tier` (selected checkout tier), not `focusedPlanId`.

## Business Impact Estimate
- Acquisition: **Low** — affects checkout stage.
- Activation: **Medium** — cleaner context keeps post-checkout routing and onboarding expectations consistent.
- Paid conversion: **Medium-High** — prevents bad context from degrading billing analytics and optimization decisions.
- Retention: **Medium** — more reliable event data supports better funnel/product tuning.

## Risk Notes
- Backward-compatible for valid clients.
- Invalid mismatched clients now fail fast with explicit error.
- No Stripe pricing logic changed.
