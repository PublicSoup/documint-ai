# MEMORY.md — DocuMint AI Operational Memory

_Last updated: 2026-02-26 (America/Chicago)_

## Purpose
Canonical long-term memory for autonomous runs and cron/subagent continuity. Keep concise, high-signal, and action-oriented.

## User + Delivery Contract
- User: Dylan (America/Chicago).
- Execution mode: autonomous batches without repeated prompts.
- Batch output required: changed files, verification status, risk notes, next batch plan.
- Quality bar: deploy-ready, enterprise-grade, security-first.

## Product Priorities (ordered)
1. Subscriber growth + paid conversion
2. IDE reliability and end-to-end functionality
3. API route hardening/security controls
4. WebContainer resilience/lifecycle safety
5. Mermaid quality/safety + architecture UX

## Active Operating Loop
Audit → Plan → Implement → Verify → Document → Commit

## Current State Snapshot
- API hardening significantly expanded across team + analytics routes.
- IDE growth path implemented with AI Website Generator and conversion-focused generation flow.
- Mermaid rendering path and WebContainer lifecycle received reliability hardening.

## Shipped Capabilities (high value)
### Growth / Conversion
- AI Website Generator flow in IDE.
- Generated project launch metadata:
  - `launchChecklist`
  - `conversionHooks`
- `POST /api/ide/generate-conversion-variants` added with:
  - auth check
  - zod validation
  - rate limiting
  - strict JSON parsing
  - audit logging

### Security / Hardening
- Team mutation route hardening (`teams/create`, `teams/invite`, `teams/invite/revoke`):
  - normalized invite emails
  - self-invite prevention
  - sanitized invite response (no token leakage)
  - stronger conflict and 429 handling
- Team visibility tightening:
  - pending invites only exposed to OWNER/ADMIN in team listing route
- Analytics hardening:
  - safer payload parsing
  - sessionId sanitization
  - clearer forbidden/rate-limit mapping
  - defense-in-depth team membership check in analytics lib
  - analytics page guards unauthorized team access

### UX / Reliability
- Dashboard analytics link preserves `teamId` context.
- Settings page improvements:
  - product updates toggle
  - save preferences action
  - in-flight disabled states
  - improved key compatibility + retry affordance
- Team UI typing cleanup and error-noise reduction.

## Verification Record
- Most recent explicit green verification: `npm run build` passed after conversion-variants feature batch.

## Completed vs Pending (cron quick-scan)
### Completed
- Team + analytics API hardening baseline established and shipped.
- IDE AI Website Generator and conversion-variant generation flow shipped.
- Launch-readiness metadata (`launchChecklist`, `conversionHooks`) integrated.
- Mermaid/WebContainer reliability hardening completed for current batch scope.
- Root operational `MEMORY.md` established for cross-run continuity.

### Pending
- Conversion funnel instrumentation (server-side events + dashboard surfacing).
- Remaining mutation-route audit for full authz/rate-limit/audit parity.
- WebContainer failure recovery deepening (timeouts/retries/state reconciliation).
- Full verification cadence (`build` + `lint` + `test` when available) each major batch.

## Known Runtime Risk
- Some runs experienced execution backend limits (`exec` allowlist/sandbox issues), intermittently blocking build/git verification in constrained runtimes.
- Mitigation: prefer gateway-host execution path when available.

## Next Recommended Batch (if idle)
1. Expand conversion funnel instrumentation (server-side event logging + analytics surfacing).
2. Continue API mutation route audit for authz/rate-limit/audit coverage gaps.
3. Strengthen WebContainer failure recovery + timeout handling.
4. Run full verification pipeline (`build` → `lint` → `test` where configured) and commit atomically.

## Agent Notes (efficiency rules)
- Treat this file as source-of-truth summary; daily logs remain detailed ledger.
- Append only material changes; avoid verbose narrative.
- Prefer bullets, stable headings, and ordered priorities for fast machine parsing.
