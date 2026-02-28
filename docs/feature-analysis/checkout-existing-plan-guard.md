# Feature Impact: Checkout Existing-Plan Guard

## Summary
Added a subscription guard that blocks creating a new Stripe checkout session when the user is already active/trialing on the requested plan.

## Technical Changes
- `src/app/api/checkout/route.ts`
  - Checkout route now loads current subscription `plan` and `status`.
  - If user already has requested `tier` with status `active` or `trialing`, API returns `400` with a clear message.

## Business Impact Estimate
- Acquisition: **Low** — billing-stage behavior.
- Activation: **Medium** — reduces confusion and duplicate checkout attempts.
- Paid conversion: **Medium** — cleaner upgrade path prevents users from entering redundant checkout loops.
- Retention: **Medium** — lower billing friction improves trust and account confidence.

## Risk Notes
- Guard is narrow: only blocks exact-plan duplicates in active/trialing state.
- No changes to Stripe price mapping or payment execution logic.
