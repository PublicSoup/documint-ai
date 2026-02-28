# Conversion Event Schema v1 (Post-Unblock Ready)

## Purpose
Standardize marketing conversion events so all future growth experiments produce comparable analytics.

## Canonical Fields
- `eventName` (string, required)
- `location` (string, required)
- `href` (string, required)
- `variant` (string, optional) — experiment bucket label
- `sessionHint` (string, optional) — non-PII client session marker
- `ts` (number, optional) — epoch milliseconds

## Allowed Event Names (current)
- `landing_primary_cta_click`
- `landing_secondary_cta_click`
- `landing_pricing_cta_click`
- `landing_final_cta_click`

## Growth Rule
When adding A/B tests, always include `variant` and keep `eventName` stable to preserve trend continuity.

## Enterprise Safety Notes
- Never include raw personal data in event payload.
- Keep allowlist enforcement on server route.
- Apply rate limiting on all anonymous event ingress.

## Business Impact
- **Acquisition:** cleaner event quality improves funnel diagnosis speed.
- **Activation:** enables confident CTA iteration.
- **Paid conversion:** supports pricing copy tests with trustworthy measurement.
- **Retention:** better-fit acquisition from data-informed messaging.
