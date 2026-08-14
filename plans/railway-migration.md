# Vercel → Railway Migration Plan

> **Status**: In progress — executor scaffolded, Railway config landed
> **Created**: 2026-08-14
> **Sandbox model chosen**: **In-container execution** (run user/agent code via `child_process` inside the main app container)

## Progress log

- **✅ Executor module scaffolded** — `src/lib/executor/` (`types.ts`, `local-sandbox.ts`, `vercel-sandbox.ts`, `registry.ts`, `index.ts`). Host-agnostic `Sandbox` interface + `createSandbox()` factory. In-container `LocalSandbox` runs commands in per-run temp workspaces with **secret-free child env**, path confinement, output caps, timeouts, and a TTL reaper. Typechecks + lints clean; smoke-tested (write/exec/read/stop, env-scrubbing, path-traversal rejection all pass).
- **✅ Runtime provider gate** — `src/lib/runtime.ts` now exposes `sandboxProvider` (`vercel` on Vercel, `local` elsewhere, override via `SANDBOX_PROVIDER`). Legacy `canUseSandbox`/`canExecuteCommands` flags left untouched → **zero behavior change** until call sites migrate.
- **✅ Railway config** — `Dockerfile` (Node 24 + python3/git for the executor, non-root user, deferred DDL, build-time env handled), `.dockerignore` (keeps `.env*` out of the image), `railway.json` (Dockerfile builder, `/api/health` check, start command runs `ensure-ai-schema` then `next start`).
- **✅ Integration WS-3** — all 3 call sites now go through `createSandbox()`:
  - `src/lib/agent/agent-sandbox.ts` (agent `execute_command` + dev-server preview) — plus dynamic port allocation (`allocatePort`), loopback readiness probing (`probeUrl`), and Vite `base` injection so proxied previews resolve their assets.
  - `src/app/api/ide/sandbox/run/route.ts` (run Python/… in the IDE).
  - `src/lib/sandbox.ts` (legacy one-off helper).
  - `runtime.ts`: `canUseSandbox` now true in **production** wherever a provider is set (Vercel *or* Railway), so the agent routes into the seeded sandbox on Railway. Direct in-process execFile stays dev-only.
- **✅ Integration WS-4** — preview proxy `src/app/api/preview/[sandboxId]/[port]/[[...path]]/route.ts`. Forwards the capability-scoped public URL to the sandbox dev server on loopback, with an SSRF guard (port must equal the sandbox's active preview port). **MVP limits**: HTTP only (no HMR/WebSocket upgrade — manual refresh picks up changes); Vite/static work, Next dev under a sub-path is not fully supported yet.
- **✅ Dockerfile** now installs `python-is-python3` (the IDE command planner calls `python`).
- **Verified**: `tsc` + `eslint` clean on all changed files; executor unit smoke test + an end-to-end dev-server→loopback-probe→proxy-forward→cleanup test both pass (incl. secret-scrubbing and path-traversal rejection).
- **⏳ NEXT**: run the app on Railway with real env (WS-5 — set `AI_GATEWAY_API_KEY`, update OAuth/Stripe/Inngest callback URLs), then live-verify the four flows (WS-8). Optional hardening polish (WS-7): concurrency cap, per-sandbox disk/mem limits, command allow-list review. HMR-over-proxy is the main deferred feature.

## 1. Goal

Move DocuMint AI off Vercel and onto Railway (`https://documint-ai-production.up.railway.app`) with feature parity. The only feature implemented *specifically* for Vercel is the server-side **Vercel Sandbox**; we replace it with our own **in-container executor**. Everything else is either already portable or a config change.

## 2. What's portable vs. Vercel-locked

### Already portable — no code change
| Feature | Where | Note |
|---|---|---|
| In-browser IDE runtime | `src/hooks/use-execution-engine.ts`, `src/lib/web-container.ts` | **WebContainers run in the browser** (StackBlitz). Handles Node + static projects client-side on any host. Only needs COOP/COEP/CSP headers. |
| Security headers / COOP-COEP-CSP | `src/proxy.ts` (middleware) | Per-request, framework-level. Not a Vercel feature. |
| Postgres workspace store | `src/lib/agent/vm-fs.ts` → `db.file` | Workspace files live in Postgres, not on Vercel. |
| Inngest background jobs | `src/inngest/*`, `src/app/api/inngest/route.ts` | Inngest Cloud calls our `/api/inngest` endpoint — works on any URL. |
| Stripe, Upstash Redis, Supabase Storage, Resend, NextAuth | various | External services; env vars only. |
| `@vercel/og` | `src/app/api/og/route.tsx` | Runs on plain Node. Keep the dependency; it is not platform-locked. |

### Vercel-locked — must change
| # | Item | Where | Action |
|---|---|---|---|
| 1 | `@vercel/sandbox` | `src/lib/sandbox.ts`, `src/lib/agent/agent-sandbox.ts`, `src/app/api/ide/sandbox/run/route.ts` | Replace with in-container executor behind an interface. **Main work.** |
| 2 | Runtime gate `canUseSandbox = isVercel && prod` | `src/lib/runtime.ts` | Make Railway-aware; drive by explicit `SANDBOX_PROVIDER` env. |
| 3 | AI Gateway OIDC fallback | `src/lib/ai.ts:140`, `src/lib/ai-model-catalog.ts:30` | Require `AI_GATEWAY_API_KEY` (or BYO / `GOOGLE_API_KEY`); stop relying on `VERCEL_OIDC_TOKEN`/`VERCEL`. |
| 4 | Build-time DB DDL | `scripts/ensure-ai-schema.mjs` (in `build` script) | Connects to DB at build. Ensure Railway build has `DIRECT_URL`, **or** move to release/startup. |

### Cosmetic / optional
- `@vercel/analytics` (already gated on `process.env.VERCEL` in `layout.tsx`) + `@vercel/speed-insights` (currently unconditional) → make both no-op off Vercel; drop `va.vercel-scripts.com` / `vitals.vercel-insights.com` from CSP.
- `maxDuration` route exports → Railway ignores them. **Leave as-is** (no function timeout on Railway is actually better for long agent/sandbox runs).
- `vercel.json`, `.vercel/`, `.vercelignore` → unused by Railway; keep or delete.

## 3. Target architecture (in-container executor)

```
Railway service (one container, Dockerfile-built)
├─ Next.js server (next start)                     ← web app, API, agent loop
├─ Language runtimes in the image                  ← node, python3, go, php, jdk, bash…
├─ Executor: child_process into /tmp/documint-sandboxes/<id>/
│     • per-run temp workspace, seeded from db.file
│     • scrubbed env (NO app secrets passed to child)
│     • timeouts + output caps + concurrency cap
│     • dev servers bind 127.0.0.1:<allocated port>
└─ Preview proxy: /api/preview/<sandboxId>/*  →  http://127.0.0.1:<port>/*
```

Key consequence of *in-container*: previews are **same-origin** (proxied through the app), which is simpler for CSP than Vercel's `*.vercel.run`. The new moving part is the **preview proxy** (HTTP + WebSocket/HMR).

## 4. Workstreams

### WS-1 — Railway platform config
- **Dockerfile** (recommended over Nixpacks, because we install several language runtimes):
  - Base `node:24-bookworm`; `apt-get install` python3/pip, golang, default-jdk, php-cli, build-essential, git.
  - `npm ci` → `npx prisma generate` → `next build` → `next start`.
  - Create unprivileged `sandbox` user; run the app as it (child processes inherit the unprivileged identity).
  - Optional: `output: 'standalone'` in `next.config.ts` for a smaller image.
- **`railway.json`**: Dockerfile builder, `startCommand`, healthcheck `/api/health`, restart policy.
- **Build-time DB**: set `DIRECT_URL`/`DATABASE_URL` in Railway so `ensure-ai-schema.mjs` + `prisma generate` succeed. Preferred: move `ensure-ai-schema` + `prisma migrate deploy` to a **release/start step** (`start` script or Railway "deploy" command) so builds don't depend on DB reachability.

### WS-2 — Runtime detection (`src/lib/runtime.ts`)
- Add explicit `SANDBOX_PROVIDER = "vercel" | "local" | "none"` (default: infer — `vercel` when `process.env.VERCEL`, else `local` in prod).
- `canUseSandbox = provider !== "none"`. `canExecuteCommands` becomes true when the local executor is active (prod on Railway). Add `isRailway = !!process.env.RAILWAY_ENVIRONMENT`; `runtimeName = 'railway'`.
- Keep the DB Accelerate branch in `src/lib/db.ts` (only triggers on `prisma://` URLs) — Railway uses a direct URL, so the standard client is used automatically.

### WS-3 — Sandbox abstraction + LocalSandbox (the core)
New module `src/lib/sandbox/`:
- `provider.ts` — interface both call sites already imply:
  ```
  create(opts): Promise<SandboxInstance>
  SandboxInstance:
    sandboxId: string
    writeFiles(files: {path, content: Buffer}[]): Promise<void>
    writeFile(path, content): Promise<void>          // used by legacy lib/sandbox.ts
    readFileToBuffer({path, cwd?}): Promise<Buffer|null>
    runCommand({cmd, args?, cwd?, env?, detached?, stdout?, stderr?}): Promise<CommandHandle>
    domain(port): string
    stop(): Promise<void>
  CommandHandle: { exitCode?, cmdId, stdout(): Promise<string>, stderr(): Promise<string> }
  ```
  (The IDE route calls `done.stdout()/.stderr()` as methods; agent-sandbox streams via `stdout`/`stderr` PassThroughs and reads `.exitCode`. The handle must support **both**.)
- `local-sandbox.ts` — child_process implementation: temp workspace under `/tmp/documint-sandboxes/<id>`, `spawn` with scrubbed env, port allocation for dev servers, TTL reaper (~15 min, matching current preview lifetime).
- `registry.ts` — global `Map<sandboxId, {port, proc, dir, expiresAt}>` for the preview proxy + reaper.
- `index.ts` — `createSandbox()` selects provider from env.
- **Refactor the 3 call sites** to use the abstraction instead of `import("@vercel/sandbox")`:
  - `src/lib/agent/agent-sandbox.ts` (`loadSandboxClass`, and make `SANDBOX_HOME`/`toSandboxCwd` path-mapping provider-aware).
  - `src/app/api/ide/sandbox/run/route.ts` (`loadSandbox`).
  - `src/lib/sandbox.ts` (`initSandbox`; note it uses `writeFile` singular).

### WS-4 — Preview proxy (new infra for in-container)
- Route `src/app/api/preview/[sandboxId]/[...path]/route.ts`: look up port in registry, proxy HTTP to `http://127.0.0.1:<port>`.
- `LocalSandbox.domain(port)` returns `${NEXT_PUBLIC_APP_URL}/api/preview/<sandboxId>/`.
- **WebSocket/HMR** is the hard part (Next App Router route handlers don't upgrade WS). Options, pick one:
  - (a) Custom `server.js` that handles `upgrade` events beside Next (most robust; Railway runs it as start command).
  - (b) Separate proxy on its own port + Railway public domain.
  - (c) **MVP: no HMR** — previews do full-page reload. Ship first, add (a) later.
- Update `agent-sandbox.ts::buildViteWrapperConfig`: replace `.vercel.run` in `allowedHosts` with the Railway app host; fix `hmr.clientPort`/`protocol` for the proxied path (or disable HMR for MVP).
- CSP: previews are same-origin, so `/code` `frame-src 'self'` already covers them. Remove the `*.vercel.run` assumption where present.

### WS-5 — AI Gateway + env + external services
- Set `AI_GATEWAY_API_KEY` in Railway (the `.env.railway` TODO), or rely on BYO keys / `GOOGLE_API_KEY`. Adjust `hasSharedAiProviderConfigured()` and `ai-model-catalog.ts:30` to not depend on `VERCEL_OIDC_TOKEN`/`VERCEL`.
- Import all `.env.railway` vars into Railway (Raw Editor). `NEXTAUTH_URL` / `NEXT_PUBLIC_APP_URL` already point at the Railway domain.
- Update external callbacks to the Railway domain: Google/GitHub/Auth0 OAuth redirect URIs, Stripe webhook endpoint (+ re-issue `STRIPE_WEBHOOK_SECRET`), Inngest Cloud app URL/sync.

### WS-6 — Optional cleanup
- Make `SpeedInsights` conditional like `Analytics`; trim CSP analytics hosts if removed.
- Keep `@vercel/og`. Optionally delete `vercel.json` / `.vercel/` / `cf-deploy.sh` clutter.

### WS-7 — Security hardening (required for in-container; user code is untrusted)
- **Scrub env**: pass child processes only an explicit safe allowlist + user-supplied env. Never expose `DATABASE_URL`, Stripe, `NEXTAUTH_SECRET`, `ENCRYPTION_KEY`, etc. (Same user → same secrets otherwise.)
- Run app + children as unprivileged `sandbox` user; confine writes to `/tmp/documint-sandboxes/<id>`; app source must be non-writable by that user.
- Resource caps: command timeouts (already present), memory/CPU via `ulimit`/`prlimit` wrapper, max output (already truncated), **max concurrent sandboxes**, temp-dir disk quota + reaper.
- Command allowlist: review `COMMAND_RULES`/`parseCommandPlan` for in-container safety (block `curl … | sh`, access to Railway internal/metadata network).
- Consider egress restrictions from child processes.

### WS-8 — Verify & deploy
- Local (`SANDBOX_PROVIDER=local`): IDE Node run (WebContainer, unaffected) · IDE Python run (server executor) · agent `execute_command` (npm install + build) · agent dev-server preview (proxy + URL).
- Railway smoke test: `/api/health`, login (each OAuth provider), Stripe webhook, Inngest sync, all four sandbox flows above.
- Update `DEPLOYMENT.md` / `README.md` for Railway.

## 5. Effort & sequencing
1. WS-1 + WS-2 + WS-5 (config, runtime flag, env) → app boots on Railway (WebContainer previews already work). **Small.**
2. WS-3 (executor + refactor call sites) → server languages + agent commands work. **Large.**
3. WS-4 (preview proxy) → agent/IDE dev-server previews. **Medium** (Large if HMR now vs. MVP later).
4. WS-7 (hardening) → in parallel with WS-3/4, before real traffic. **Medium.**
5. WS-6, WS-8 → cleanup + verification. **Small/Medium.**

## 6. Open questions / risks
- **Isolation ceiling**: in-container child processes share the app's kernel and user — env scrubbing + caps reduce blast radius but this is *not* VM isolation. Acceptable per the chosen model; revisit if abuse appears (separate executor service or managed provider are the upgrade paths, same interface).
- **WebSocket/HMR** through the proxy — MVP without it, or ship a custom server.
- **Build-time DB** for `ensure-ai-schema.mjs` — prefer moving to release/startup.
- **Image size / cold builds** with multiple language runtimes — trim to the languages actually offered.
- Scope note: `mobile/` (untracked) is out of scope for this web migration.
