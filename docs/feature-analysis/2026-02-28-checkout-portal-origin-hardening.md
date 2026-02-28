# 2026-02-28 — Checkout Portal Origin Hardening

## Scope
Hardened `POST /api/checkout/portal` return URL origin handling to enforce trusted origin boundaries for Stripe customer portal redirects.

## Changes
- Added `isAllowedOrigin(origin)` with strict protocol/host validation.
- Allowlisted trusted origins to:
  - exact `NEXT_PUBLIC_APP_URL` host+protocol
  - localhost development hosts (`localhost`, `127.0.0.1`)
- Updated `resolveOrigin` to reject untrusted `Origin` headers and safely fall back to app URL/default.

## Why this matters
Prevents hostile or malformed `Origin` header influence over Stripe portal `return_url`, reducing open-redirect and trust-boundary risks in billing flows.

## Enterprise impact estimate
- **Acquisition:** Medium (better security posture in vendor/security reviews).
- **Activation:** Low-Medium (more predictable billing flow behavior).
- **Paid conversion:** Medium (safer billing entry/exit path increases trust).
- **Retention:** High (hardens recurring billing UX and support reliability).

## Verification
- `npm run build` ✅ passed after change.

## Risk notes
- Strict host/protocol checks may reject unexpected staging origins unless explicitly set via `NEXT_PUBLIC_APP_URL`.
