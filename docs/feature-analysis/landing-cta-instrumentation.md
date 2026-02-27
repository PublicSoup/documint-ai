# Landing CTA Instrumentation

## Summary
Implemented first-party conversion instrumentation for high-intent landing-page CTAs.

## Implemented
- Added `POST /api/analytics/marketing-event` with:
  - Zod payload validation
  - IP-based rate limiting
  - strict event allowlist
  - audit-log persistence (`MARKETING_EVENT`)
- Added reusable client component: `TrackedLink`.
- Wired event tracking for key conversion CTAs:
  - hero primary CTA
  - hero secondary CTA
  - pricing CTA(s)
  - final CTA

## Why this matters
This enables attribution for pre-auth conversion interactions, so growth work can be measured rather than guessed.

## Expected Impact
- **Acquisition:** Better visibility into channel/section CTA performance.
- **Activation:** Identifies where users commit to sign-up in the funnel.
- **Paid conversion:** Supports pricing copy optimization with measurable outcomes.
- **Retention:** Indirect; better-fit acquisition improves downstream cohort quality.

## Risks
- Event volume currently lands in audit logs; for scale, route to dedicated analytics storage in a future batch.
