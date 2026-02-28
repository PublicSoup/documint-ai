# Session Hint Storage Fallback Hardening

## Summary
Hardened client tracking to gracefully handle environments where `localStorage` is unavailable or throws.

## Implemented
- Updated `getOrCreateSessionHint` in `TrackedLink`:
  - wraps `localStorage` read/write in `try/catch`
  - falls back to `undefined` session hint on storage failure

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** avoids client-side tracking edge-case failures in restricted browser modes.
- **Paid conversion:** preserves CTA click behavior even when session hint persistence is unavailable.
- **Retention:** indirect reliability gain from safer client-side instrumentation.

## Risk
- Very low risk; fallback-only hardening with no user-facing behavior change.
- Verify/commit remains blocked while exec backend is unavailable.
