# Cloudflare Migration Checklist

This checklist tracks the progress of moving `documint-ai-main` from a Node.js/Vercel runtime to a Cloudflare Pages/Workers environment.

## Batch 1: Abstraction and Scaffolding (In Progress)
- [x] Add Cloudflare tooling dependencies (`@opennextjs/cloudflare`, `wrangler`).
- [x] Add Cloudflare config files (`wrangler.toml`, `open-next.config.ts`).
- [x] Create runtime abstraction layer (`src/lib/runtime.ts`).
- [x] Refactor `src/lib/sandbox.ts` to respect runtime capabilities (disable Vercel sandbox on Cloudflare).
- [x] Refactor `src/lib/agent/engine.ts` to isolate Node.js modules (`child_process`, `fs/promises`) based on the runtime.
- [x] Centralize DB initialization in `src/lib/db.ts` to prepare for edge-compatible clients.

## Batch 2: Database and Testing (In Progress)
- [x] Implement Prisma Accelerate or a fetch-based edge client in `src/lib/db.ts`.
- [ ] Migrate environment variables to the Cloudflare Pages project.
  - `DATABASE_URL` / `DIRECT_URL` (or proxy equivalents)
  - `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL`
  - Stripe Keys (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`)
  - AI Keys (`GOOGLE_API_KEY`, etc.)
- [ ] Test the build process using `npm run cf:build`.
- [ ] Deploy and test on a Cloudflare preview URL (`npm run cf:preview`).
- [ ] Validate core flows in the preview environment:
  - Auth (NextAuth)
  - Database reads/writes
  - Stripe webhooks and checkout
  - File uploads
  - AI generation

## Batch 3: Production Cutover (Pending)
- [ ] Review Cloudflare analytics and logs for the preview deployment.
- [ ] Point production custom domain (`documintai.dev`) to the Cloudflare Pages project.
- [ ] Perform a live smoke test.
- [ ] Decommission the legacy Vercel deployment.
