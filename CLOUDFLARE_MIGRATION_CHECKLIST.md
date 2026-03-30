# Cloudflare Migration Checklist

This checklist tracks the progress of moving `documint-ai-main` from a Node.js/Vercel runtime to a Cloudflare Pages/Workers environment.

## Batch 1: Abstraction and Scaffolding ✅ COMPLETE
- [x] **Setup Tooling**: Install `@opennextjs/cloudflare` and `wrangler`.
- [x] **Runtime Abstraction**: Create `src/lib/runtime.ts` to detect edge/node environments.
- [x] **Database Client**: Harden `src/lib/db.ts` to use Prisma Accelerate on the edge.
- [x] **Type Safety Sweep**: Eliminated all explicit `any` types from API routes to ensure runtime stability on Cloudflare Workers.
- [x] **Deployment Automation**: Created `scripts/cf-deploy.sh` for unified build/deploy pipeline.
- [x] Refactor `src/lib/agent/engine.ts` to isolate Node.js modules (`child_process`, `fs/promises`) based on the runtime.
- [x] Centralize DB initialization in `src/lib/db.ts` to prepare for edge-compatible clients.
- [x] **Fix cf:build script** — Removed double-build, now runs `npx prisma generate && npx @opennextjs/cloudflare`.
- [x] **Fix @vercel/sandbox** — Fully dynamic import via `initSandbox()`, no top-level reference.
- [x] **Fix child_process** — Dynamic import via `getExecFile()`, no top-level reference in engine.ts.
- [x] **Fix @vercel/analytics** — Conditionally loaded only when `VERCEL` env is set.
- [x] **Fix @vercel/og** — Dynamic import with fallback to static image on non-Vercel runtimes.
- [x] **Update wrangler.toml** — Added `CF_PAGES=1` marker, documented all required env vars and secrets.

## Batch 2: Database and Testing (Ready to Execute)
- [x] Implement Prisma Accelerate or a fetch-based edge client in `src/lib/db.ts`.
- [ ] **Migrate environment variables to Cloudflare** — See `wrangler.toml` for full list of required vars and secrets.
- [ ] **Test the build process** — Run `npm run cf:build` and verify `.open-next/worker.js` is generated.
- [ ] **Deploy and test on a Cloudflare preview URL** — Run `npm run cf:deploy` and test on `*.pages.dev`.
- [ ] **Validate core flows** in the preview environment:
  - Auth (NextAuth)
  - Database reads/writes
  - Stripe webhooks and checkout
  - File uploads
  - AI generation
  - OG image generation (should redirect to static fallback)

## Batch 3: Production Cutover (Pending)
- [ ] **Stripe webhook URL** — Update Stripe dashboard to point webhook to `https://documintai.dev/api/webhooks/stripe`.
- [ ] **NextAuth callback URLs** — Update OAuth providers with the new domain.
- [ ] Review Cloudflare analytics and logs for the preview deployment.
- [ ] Point production custom domain (`documintai.dev`) to the Cloudflare Pages project.
- [ ] Perform a live smoke test.
- [ ] Decommission the legacy Vercel deployment.
