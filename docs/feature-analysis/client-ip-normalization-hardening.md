# Feature Impact: Client IP Normalization Hardening

## Summary
Hardened client IP extraction in rate-limiting utilities by validating and normalizing forwarded IP header values before use.

## Technical Changes
- `src/lib/rate-limit.ts`
  - Added `normalizeClientIp` helper.
  - Limits candidate token size and extracts first forwarded entry safely.
  - Accepts only IPv4/IPv6-like tokens; rejects malformed/spoof strings.
  - Applies normalization to `cf-connecting-ip`, `x-real-ip`, and `x-forwarded-for` paths.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (more reliable abuse controls and fairer per-client throttling)

## Risk Notes
- Falls back to localhost sentinel when headers are missing/invalid.
- Backward compatible for valid proxy headers.
