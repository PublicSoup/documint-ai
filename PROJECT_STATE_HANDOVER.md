# Project Handover: DocuMint AI Infrastructure Refactor

This document serves as the "Master State" summary for the DocuMint AI platform refactoring effort. It outlines the radical transformation from a monolithic/blocking architecture to a resilient, high-margin, serverless-first system.

## 1. Core Architectural Pillars (Completed)

### Vercel AI SDK Migration
- **Dependency**: Switched from raw `@google/generative-ai` to `@ai-sdk/google` + `ai`.
- **Logic**: Centralized in `src/lib/ai.ts`.
- **Features**: Integrated structured output (`generateObject`) with Zod schemas for "Intent Drift" analytics and native streaming support.
- **Profitability**: Bound `VERCEL_AI_GATEWAY_URL` to enable edge-caching for Gemini responses, stopping redundant LLM costs.

### Inngest v4 Background Workflows
- **Problem**: Massive GitHub imports and codebase audits were timing out (Vercel Node/Edge limits).
- **Solution**: Decoupled heavy logic into event-driven background jobs.
- **Files**: 
  - `src/inngest/client.ts`: Main client.
  - `src/inngest/functions/`: contains `analyze-codebase.ts` and `github-import.ts`.
- **Note**: Using Inngest v4 syntax (`triggers: [{ event: "..." }]`).

### Global Rate Limiting (Upstash)
- **Problem**: In-memory `Map` counters fail in Serverless environments (cloned nodes don't share memory).
- **Solution**: Implemented `@upstash/redis` in `src/lib/rate-limit.ts`.
- **Resiliency**: Added safety guards to prevent build-time crashes when environment variables are missing during the Next.js `collecting page data` phase.

### Edge Infrastructure & Telemetry
- **Proxy Migration**: Renamed `middleware.ts` to `proxy.ts` (Next.js 16 standard) for Edge intercepts.
- **Monitoring**: Integrated `@vercel/speed-insights` in `src/app/layout.tsx` for Real-User-Monitoring (RUM).
- **Security**: Verified `/admin` routes are protected by email/role-based checks at the Edge.

## 2. Environment Configuration (Handover Keys)
The following keys are **mandatory** in the Vercel Dashboard for the app to function:
- `GOOGLE_API_KEY`: For Gemini access.
- `UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`: For global rate-limiting.
- `INNGEST_EVENT_KEY` & `INNGEST_SIGNING_KEY`: For workflow orchestration.
- `VERCEL_AI_GATEWAY_URL`: For LLM caching.
- `NEXTAUTH_SECRET` & `AUTH0_*`: For identity.

## 3. Deployment Status
- **Current Stack**: Next.js 16.1 (Turbopack), Prisma, Supabase (Postgres/Storage), Inngest (Workflows), Upstash (Redis).
- **DNS**: Porkbun -> Cloudflare (Nameservers) -> Vercel (CNAME to `cname.vercel-dns.com` via Gray Cloud).

---

## 4. Phase 4: Extreme Performance & Edge Rewrites (UP NEXT)

The next agent should focus on **Phase 4: Optimization via External Rewrites**.

### Goal
Maximize margins and achieve <10ms response times for all GitHub-related data.

### Tasks
1. **NextJS Rewrites**: å
   - Modify `next.config.ts` to add `async rewrites()`. 
   - Map requests from `/proxy/github/:path*` to `https://api.github.com/:path*`.
   - This allows Vercel's Edge nodes to treat GitHub's API as a local asset for caching purposes.
2. **Data Cache Injection**:
   - Refactor every `fetch` call in `src/app/api/github/` (specifically repo/PR listings).
   - Inject `{ next: { revalidate: 60 } }` to cache JSON payloads globally.
   - Use `tags` for on-demand revalidation if a repository is updated.
3. **Image Optimization Aggression**:
   - Set `minimumCacheTTL: 86400` in `next.config.ts` to cache GitHub user avatars for 24 hours at the CDN level.

---

**Summary Produced By**: Antigravity (Principal Architect)
**Status**: Build Green | Deployment Verified.
were working on a website thats the first agentic web ide with github integration using a custom agentic coding engine like cline but for the web and with a gui and whatnot 