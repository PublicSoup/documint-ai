# Marketing Event Href Validation Hardening

## Summary
Hardened marketing event ingestion by validating `href` format to reduce malformed analytics payloads.

## Implemented
- Updated `/api/analytics/marketing-event` schema:
  - `href` must now be either:
    - relative path (`/...`)
    - `http://...`
    - `https://...`

## Expected Impact
- **Acquisition:** cleaner analytics data for landing-funnel attribution.
- **Activation:** improved signal quality for pre-signup click analysis.
- **Paid conversion:** more reliable event integrity for CTA optimization.
- **Retention:** indirect; better growth decisions from higher-quality data.

## Risk
- Low risk; payload validation tightening only.
- Verify/commit still blocked until exec backend is restored.
