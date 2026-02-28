# Feature Impact: Rate-Limit 429 Error Envelope Alignment

## Summary
Aligned rate-limit enforcement with HTTP semantics by returning explicit `429 TOO_MANY_REQUESTS` API errors instead of service-unavailable style errors.

## Technical Changes
- `src/lib/api-utils.ts`
  - Added `ApiErrors.tooManyRequests(...)` helper (`429`, code `TOO_MANY_REQUESTS`).
- `src/lib/rate-limit.ts`
  - Updated `enforceRateLimit` to throw `ApiErrors.tooManyRequests` with wait-time guidance.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (clearer client behavior and retry handling under throttling)

## Risk Notes
- Backward-compatible envelope shape; only status/code semantics are corrected.
- Improves compatibility with clients/middleware expecting 429-specific retry logic.
