# Team Member Role Enum Hardening

## Summary
Hardened `PATCH /api/teams/[teamId]/members` role validation to only allow roles supported by the `TeamMember` domain model.

## Change
- Replaced permissive role enum (`OWNER|ADMIN|EDITOR|VIEWER|MEMBER`) with strict enum:
  - `OWNER`
  - `ADMIN`
  - `MEMBER`

## Why this matters
- Prevents invalid role states from entering persistence and permission checks.
- Avoids authorization drift caused by unsupported roles (`EDITOR`, `VIEWER`) that are not part of the team membership model.
- Strengthens consistency between API validation and database/domain constraints.

## Estimated business impact
- Acquisition: low
- Activation: low
- Paid conversion: low (indirect)
- Retention: medium (authorization reliability)
