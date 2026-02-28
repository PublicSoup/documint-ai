# Marketing Event Location Allowlist Hardening

## Summary
Hardened `/api/analytics/marketing-event` by adding an allowlist gate for `location` values to prevent uncontrolled dimension/cardinality growth.

## Implemented
- Added exact-token allowlist for known landing locations.
- Added allowed-prefix list for dynamic families (e.g., `pricing_...`).
- Updated `location` schema validation to require both:
  - token format regex
  - allowlist/prefix membership

## Expected Impact
- **Acquisition:** cleaner funnel segmentation and less noisy analytics dimensions.
- **Activation:** more trustworthy CTA-path reporting.
- **Paid conversion:** better attribution quality for pricing/location experiments.
- **Retention:** improved telemetry governance and analytics reliability.

## Risk
- Low risk; list includes current known tracked locations and pricing prefix.
- Verify/commit remains blocked while exec backend is unavailable.
