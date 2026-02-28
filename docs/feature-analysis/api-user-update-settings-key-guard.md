# API User Update Settings-Key Guard

## Summary
Hardened `PATCH /api/user/update` to block sensitive settings key mutation (`apiKey`) through generic profile settings updates.

## Implemented
- Added `DISALLOWED_SETTINGS_KEYS` guard.
- If payload includes blocked key (`apiKey`), route returns forbidden error.
- Prevents bypassing dedicated API-key rotation controls/auditing through broad settings merge path.

## Expected Impact
- **Acquisition:** neutral.
- **Activation:** neutral.
- **Paid conversion:** indirect trust gain via stronger account-security controls.
- **Retention:** improved security posture and API boundary integrity.

## Risk
- Low risk; only restricts sensitive-key update vector.
- Verify/commit remains blocked while exec backend is unavailable.
