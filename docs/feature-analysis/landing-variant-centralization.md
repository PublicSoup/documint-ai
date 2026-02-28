# Landing Variant Centralization

## Summary
Centralized landing CTA experiment variant assignment into one constant to reduce rollout errors when moving from control to active test variants.

## Implemented
- Added `LANDING_EXPERIMENT_VARIANT` constant in `src/app/page.tsx`.
- Replaced repeated inline `variant="control"` values with the shared constant across tracked CTAs.

## Expected Impact
- **Acquisition:** faster, safer experiment toggles for messaging tests.
- **Activation:** reduces instrumentation mistakes that corrupt funnel data.
- **Paid conversion:** cleaner A/B attribution supports better pricing CTA optimization.
- **Retention:** indirect lift through improved experiment reliability.

## Risk
- Very low risk (no behavior change; refactor for consistency).
- Verify/commit blocked until exec backend is restored.
