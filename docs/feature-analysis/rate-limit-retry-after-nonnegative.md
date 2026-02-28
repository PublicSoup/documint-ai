# Feature Impact: Rate-Limit Retry-After Non-Negative Guard

## Summary
Hardened rate-limit responses so `Retry-After` never returns a negative value due to clock skew or delayed response handling.

## Technical Changes
- `src/lib/rate-limit.ts`
  - Added bounded `retryAfterSeconds` calculation in `rateLimitResponse`:
    - `Math.max(0, Math.ceil(reset - now))`
  - Response header `Retry-After` now always emits a valid non-negative integer.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (more reliable client/backoff behavior under throttling)

## Risk Notes
- Backward-compatible header semantics.
- Improves standards compliance for downstream clients/CDNs that parse `Retry-After`.
