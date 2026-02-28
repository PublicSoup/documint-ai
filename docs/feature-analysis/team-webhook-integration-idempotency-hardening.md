# Team Webhook Integration Idempotency Hardening

## Summary
Hardened `POST /api/teams/[teamId]/integrations` for webhook providers (Slack/Discord) to be idempotent per team+provider.

## What changed
- Before creating a webhook integration, the route now checks for an existing integration of the same type in the same team.
- If found, it updates existing config + reactivates integration instead of creating duplicates.
- Audit logging now records `UPDATE_INTEGRATION` for updates and `CREATE_INTEGRATION` for first-time creation.
- Response status now reflects action:
  - `201` for created
  - `200` for updated

## Why this matters
- Prevents duplicate webhook entries and config drift.
- Improves operational reliability for repeated setup flows.
- Reduces accidental secret sprawl and keeps integration state deterministic.

## Estimated business impact
- Acquisition: low
- Activation: medium (smoother setup retries)
- Paid conversion: low-medium (less setup friction for teams)
- Retention: medium (more reliable integration management)
