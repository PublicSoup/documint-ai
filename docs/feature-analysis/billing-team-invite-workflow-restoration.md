# Feature Impact: Billing Team Invite Workflow Restoration

## Summary
Restored the billing Team invite workflow after regression cleanup by reintroducing typed invite state and real API submission behavior.

## Technical Changes
- `src/app/dashboard/billing/page.tsx`
  - Reintroduced invite state:
    - `invitingTeamId`
    - `inviteEmail`
    - `sendingInvite`
    - `inviteError`
    - `inviteSuccess`
  - Added `handleInvite(teamId)` using `POST /api/teams/invite`.
  - Added inline invite UI under team cards with validation/error/success handling.
  - Removed temporary informational placeholder behavior.

## Business Impact Estimate
- Acquisition: Low
- Activation: Medium (restores team collaboration setup path)
- Paid conversion: Medium (team plan workflows remain functional and trustworthy)
- Retention: Medium (reduces friction for team onboarding/invite loops)

## Risk Notes
- Uses existing hardened invite endpoint.
- Verified with full build after restoration.
