# Feature Impact: Intent-Aware Registration Deep Links

## Summary
Improved top-of-funnel subscriber conversion by making landing-page CTAs route to `/auth/register` with explicit conversion intent metadata (`intent`, `plan`, `source`) and carrying this context into post-signup login and OAuth callback flows.

## What Changed
- Landing CTA links now include structured registration context:
  - `source` (CTA origin)
  - `intent` (`signup` or `trial`)
  - `plan` (`starter` | `pro` | `team`) where relevant
- Register page now:
  - Parses and validates incoming intent/plan/source query params
  - Personalizes headline/subtitle and selected-plan indicator for trial traffic
  - Preserves attribution context when redirecting to `/auth/login`
  - Preserves attribution context for OAuth sign-in callback to `/dashboard`

## Business Impact Estimate
- Acquisition: **Medium** — cleaner CTA targeting improves top-of-funnel click relevance.
- Activation: **High** — plan-aware and intent-aware onboarding context reduces first-session confusion.
- Paid conversion: **High** — trial-intent + plan-intent continuity improves checkout readiness.
- Retention: **Low-Medium** — better expectation setting at signup can reduce early churn.

## Risk Notes
- Query metadata is constrained to allowlisted token values; invalid inputs are discarded.
- No auth or billing logic changes were introduced in this batch.
- Existing analytics event taxonomy is preserved.
