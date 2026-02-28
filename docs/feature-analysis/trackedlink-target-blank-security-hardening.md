# TrackedLink target=_blank Security Hardening

## Summary
Hardened `TrackedLink` so outbound links opened in a new tab automatically include `noopener noreferrer`.

## Implemented
- Added optional `rel` prop support in `TrackedLink`.
- Auto-applies secure rel attributes when `target="_blank"`.
- Preserves existing tracking behavior and link ergonomics.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** neutral direct impact; protects trust and security posture.
- **Retention:** indirect reliability/security confidence improvement.

## Risk
- Very low risk; standards-based link hardening.
- Verify/commit remains blocked while exec backend is unavailable.
