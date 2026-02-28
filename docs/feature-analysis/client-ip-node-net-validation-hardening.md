# Feature Impact: Client IP Validation via Node `net.isIP`

## Summary
Improved rate-limit identity reliability by replacing regex-based IP acceptance with Node runtime IP parsing (`net.isIP`) for strict IPv4/IPv6 validation.

## Technical Changes
- `src/lib/rate-limit.ts`
  - Added `isIP` import from `node:net`.
  - Simplified `normalizeClientIp` to validate candidates with `isIP(candidate)`.
  - Accepts only canonical IPv4/IPv6 values recognized by Node's parser.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low
- Paid conversion: Low
- Retention: Medium (stronger abuse controls and consistent throttling identity handling)

## Risk Notes
- Backward compatible for valid client/proxy IP values.
- Malformed pseudo-IP tokens are now rejected deterministically.
