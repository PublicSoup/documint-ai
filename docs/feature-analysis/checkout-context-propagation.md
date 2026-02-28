# Feature Impact: Checkout Context Propagation

## Summary
Improved paid-conversion instrumentation and recovery UX by propagating trial/signup context from billing UI into checkout session metadata and cancel return URLs.

## Technical Changes
- `POST /api/checkout`
  - Added optional validated body context: `source`, `intent`, `plan`.
  - Persists context into Stripe checkout metadata for attribution analysis.
  - Persists context into `cancel_url` query parameters so users return to a context-aware billing view.
  - Extends checkout audit event with context fields.
- `src/app/dashboard/billing/page.tsx`
  - Upgrade action now sends context payload with checkout request.
  - Differentiates source token for trial banner vs plan-grid invocation.

## Business Impact Estimate
- Acquisition: **Low** — affects post-auth purchase stage.
- Activation: **Medium** — canceled checkout users return to a context-preserved billing screen.
- Paid conversion: **High** — stronger attribution and reduced reset-friction on checkout cancel path improve optimization velocity.
- Retention: **Medium** — smoother retry path lowers frustration for high-intent users.

## Risk Notes
- Body context is strictly allowlisted and optional (backward compatible).
- No Stripe billing logic/price selection rules changed.
- Invalid JSON body safely degrades to empty context.
