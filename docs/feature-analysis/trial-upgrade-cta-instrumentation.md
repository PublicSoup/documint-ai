# Feature Impact: Trial Upgrade CTA Instrumentation

## Summary
Added conversion telemetry for high-intent trial upgrade actions in authenticated surfaces (dashboard trial banner + onboarding checklist) and extended marketing-event schema allowlists accordingly.

## Technical Changes
- `src/app/api/analytics/marketing-event/route.ts`
  - Added allowlisted event: `trial_upgrade_cta_click`
  - Added allowlisted locations:
    - `dashboard_trial_banner_upgrade`
    - `onboarding_checklist_upgrade`
- `src/app/dashboard/page.tsx`
  - Replaced trial banner billing link with `TrackedLink` instrumentation.
- `src/components/onboarding-checklist.tsx`
  - Replaced upgrade link with `TrackedLink` instrumentation.
  - Propagates trial/control variant context for experiment segmentation.

## Business Impact Estimate
- Acquisition: **Low** — no top-of-funnel traffic change.
- Activation: **Medium** — identifies where trial users progress or stall in first session.
- Paid conversion: **High** — captures direct upgrade-intent clickstream for trial-to-paid optimization.
- Retention: **Medium** — better conversion diagnostics improve onboarding adjustments, reducing early churn.

## Plausibility Notes
- These are the highest-intent post-auth actions before billing conversion.
- Instrumenting both surfaces enables rapid attribution and UX iteration without schema drift.

## Risk Notes
- Strict event/location allowlists preserve payload hygiene and reject unknown telemetry.
- No billing mutations or payment execution paths were modified.
