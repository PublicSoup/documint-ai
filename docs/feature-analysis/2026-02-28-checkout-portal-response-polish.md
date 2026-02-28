# 2026-02-28 — Checkout Portal Response + Audit Polish

## Scope
Small reliability/security polish on `POST /api/checkout/portal` to improve deterministic behavior and operational observability.

## Changes
- Reused resolved trusted origin for Stripe portal return URL generation.
- Added defensive guard: throws service-unavailable error if Stripe returns a missing portal URL.
- Enhanced audit payload with `returnOrigin` to improve incident forensics on billing redirects.
- Added `Cache-Control: no-store, max-age=0` on successful portal response to avoid caching sensitive billing redirect URLs.

## Enterprise Impact Estimate
- **Acquisition:** Low-Medium (incremental security maturity signal).
- **Activation:** Low (minor UX consistency in billing flows).
- **Paid conversion:** Medium (reliable and secure billing flow increases trust at payment stage).
- **Retention:** Medium-High (better observability and safer handling of billing session links).

## Verification
- `npm run build` ✅ passed.

## Risk Notes
- Audit payload grew by one additive field (`returnOrigin`) and remains backward-compatible.
