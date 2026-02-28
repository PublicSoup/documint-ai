# API User Update Password Rate-Limit Hardening

## Summary
Hardened `PATCH /api/user/update` by adding security-tier rate limiting when password rotation is requested.

## Implemented
- Kept baseline API rate limiting for all profile updates.
- Added `security` tier rate limit when `newPassword` is present.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** neutral direct effect; strengthens account-security controls.
- **Retention:** improved trust and abuse resistance for sensitive account operations.

## Risk
- Low risk; scoped to password-change path only.
- Verify/commit remains blocked while exec backend is unavailable.
