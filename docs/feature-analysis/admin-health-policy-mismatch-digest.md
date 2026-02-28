# Feature Impact: Admin Health Policy Mismatch Digest

## Summary
Added `policyMismatchDigest` to admin health diagnostics for compact deduplication of policy-compatibility incidents.

## Technical Changes
- `src/app/api/admin/health/route.ts`
  - Added top-level `policyMismatchDigest` (short SHA-derived token).
  - Digest inputs include:
    - mismatch names
    - recommended mismatch actions
    - compatibility reason
    - compatibility action
  - Added `schemaCapabilities.policyMismatchDigest` flag.

## Business Impact Estimate
- Acquisition: Low
- Activation: Low-Medium
- Paid conversion: Low
- Retention: Medium (lower alert noise and easier mismatch-state dedup)

## Risk Notes
- Additive diagnostics-only field.
- No auth/mutation/runtime behavior changes.
