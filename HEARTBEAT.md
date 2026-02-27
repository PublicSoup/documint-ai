# HEARTBEAT.md

## Operational Checks (run on heartbeat)

1. Runtime readiness
   - verify shell backend path is available (sandbox/gateway/node)
   - verify gateway daemon status when gateway mode is used

2. Delivery continuity
   - list changed files pending verification
   - flag if build/test has been blocked > 4 hours

3. Product execution
   - ensure feature-impact notes exist for newly added features under `docs/feature-analysis/`
   - surface highest-priority next batch if no active run is in progress

## Quiet Rule

If all checks are green and no user-facing action is required: respond `HEARTBEAT_OK`.
