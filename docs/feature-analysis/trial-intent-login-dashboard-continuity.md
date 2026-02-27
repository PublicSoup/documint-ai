# Feature Impact: Trial Intent Continuity (Login → Dashboard)

## Summary
Extended the conversion context pipeline so `intent`, `plan`, and `source` survive login and are consumed in dashboard onboarding surfaces.

## Changes
- `src/app/auth/login/page.tsx`
  - Parses and validates `intent`, `plan`, and `source` query params.
  - Preserves intent context for credential login and all OAuth callback paths.
  - Personalizes login headline/subtitle for trial-intent traffic.
- `src/app/dashboard/page.tsx`
  - Parses onboarding intent params server-side with strict token guards.
  - Passes onboarding context into checklist component.
  - Adds a trial-priority banner CTA to billing when user is not yet upgraded.
- `src/components/onboarding-checklist.tsx`
  - Accepts onboarding context props.
  - Personalizes trial step labels/description.
  - Routes billing upgrade CTA with preserved context.

## Business Impact Estimate
- Acquisition: **Low-Medium** — improves continuity from landing to authenticated session.
- Activation: **High** — trial users get immediate, context-aware onboarding prompts.
- Paid conversion: **High** — stronger path from trial intent to billing action in first dashboard session.
- Retention: **Medium** — clearer first-session guidance reduces early confusion/churn.

## Risk Notes
- Query params are token-validated and length-bounded before use.
- No payment execution logic changed; only intent routing and UX guidance were updated.
