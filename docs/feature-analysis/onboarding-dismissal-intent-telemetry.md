# Feature Impact: Onboarding Dismissal Intent Telemetry

## Summary
Added intent-aware telemetry to onboarding dismissal updates so growth funnels can distinguish generic onboarding drop-off from trial-intent drop-off.

## Technical Changes
- `POST /api/onboarding`
  - Extended validated payload with optional `intent`, `plan`, and `source` fields.
  - Standardized unauthorized handling through `ApiErrors.unauthorized()` and shared `errorResponse` envelope.
  - Added non-blocking audit event `UPDATE_ONBOARDING_PREFERENCES` with dismissal + intent metadata.
- `OnboardingChecklist`
  - Dismiss action now submits context payload (`intent/plan/source`) when available.

## Business Impact Estimate
- Acquisition: **Low** — no direct top-of-funnel CTA change.
- Activation: **Medium-High** — clearer attribution of onboarding abandonment unlocks targeted activation fixes.
- Paid conversion: **Medium** — trial-plan dismissal telemetry helps identify where trial users disengage before upgrade.
- Retention: **Medium** — enables follow-up improvements that reduce early-session churn.

## Risk Notes
- Payload is allowlisted and strictly validated; invalid context is rejected safely.
- Audit logging is non-blocking to avoid user-facing regressions.
