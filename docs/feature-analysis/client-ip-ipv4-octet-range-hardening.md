# Feature Impact: Client IP IPv4 Octet Range Hardening

## Summary
Strengthened rate-limit client IP parsing by enforcing valid IPv4 octet ranges (0–255), preventing malformed numeric IP tokens from being accepted.

## Technical Changes
- `src/lib/rate-limit.ts`
  - Added `isValidIpv4` helper.
  - Validates IPv4 format and each octet numeric range.
  - `normalizeClientIp` now accepts IPv4 only when octets are in-range.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (more trustworthy throttling identity and abuse resistance)

## Risk Notes
- Backward compatible for valid proxy IP headers.
- Invalid pseudo-IPv4 strings now rejected safely.
