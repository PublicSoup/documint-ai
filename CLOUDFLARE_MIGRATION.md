## Cloudflare Migration Plan (from Vercel) – DocuMint AI

This repo is a **Next.js 16 + Prisma + Stripe + NextAuth** app currently optimized for **Vercel**.  
Because it depends on **Node.js-only features and Prisma’s Node client**, the safest path is:

- **Phase 1 (recommended first)**: Put **Cloudflare in front of the existing Vercel deployment** (DNS + CDN + WAF).  
- **Phase 2 (advanced / optional)**: Explore a full move to **Cloudflare Pages/Workers** with a different database / Prisma setup.

This doc focuses on **concrete steps you can execute today**.

---

## Phase 1 – Move DNS & Traffic Control to Cloudflare (keep Vercel as runtime)

You end up with:

- Cloudflare: DNS, SSL, CDN, WAF, rate limiting, rules.
- Vercel: still runs the Next.js app (no code changes required).

### 1. Add your domain to Cloudflare

1. Create / log in to your Cloudflare account.
2. In the dashboard, click **“Add a site”**.
3. Enter your domain (e.g. `documintai.dev`).
4. Let Cloudflare scan existing DNS records.

Cloudflare will import the current Vercel records (from `DOMAIN_SETUP.md`):

- `A  @   76.76.21.21`
- `CNAME  www  cname.vercel-dns.com`

Make sure those records exist in Cloudflare DNS and that the **orange cloud (proxy)** is enabled for them.

### 2. Point your registrar to Cloudflare

1. Cloudflare will give you **two nameservers**.
2. At your domain registrar (where you bought `documintai.dev`), change the domain’s nameservers to the ones Cloudflare shows.
3. Wait for DNS propagation (usually 5–60 minutes, up to 24h).

Traffic will now:

`User → Cloudflare (DNS/CDN/WAF) → Vercel (Next.js runtime)`

### 3. Re-create environment variables on Cloudflare (optional, for future)

Even if Vercel remains the runtime for now, you can **mirror** the env configuration in Cloudflare so cutover later is easier.

From `DEPLOYMENT.md` and `VERCEL_SETUP.md`, the critical env vars are:

- **Database**
  - `DATABASE_URL`
  - `DIRECT_URL` (if used)
- **Auth / App URLs**
  - `NEXTAUTH_SECRET`
  - `NEXTAUTH_URL` (e.g. `https://documintai.dev`)
  - `NEXT_PUBLIC_APP_URL` (same as above)
- **Google Gemini**
  - `GOOGLE_API_KEY`
- **Stripe**
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
  - `STRIPE_PRICE_ID_STARTER`
  - `STRIPE_PRICE_ID_PRO`
  - `STRIPE_PRICE_ID_TEAM`
- **Optional**
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
  - `RESEND_API_KEY`
  - `EMAIL_FROM`
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`

In Cloudflare:

- For **Pages/Workers (if/when you add them)**:  
  - Go to the project → **Settings → Variables** and add these as **Environment Variables / Secrets**.

You don’t need this for Phase 1, but having them recorded and ready matters for any future full migration.

### 4. Verify after DNS moves to Cloudflare

Once Cloudflare is authoritative for your domain:

1. Hit `https://documintai.dev/api/health` and check it returns **200 OK**.
2. Manually test:
   - Auth (login, register, password reset).
   - Stripe checkout flows.
   - File upload + doc generation.
3. In Cloudflare:
   - Confirm requests show up under **Analytics → Web traffic**.
   - Optionally enable basic **WAF rules** and **rate limiting** for `/api/*`.

At this point, your app is **“on Cloudflare” from the outside world’s perspective** (DNS, SSL, WAF), but runtime is still Vercel.

---

## Phase 2 – Prepare for a Full Runtime Migration (advanced)

Moving the *runtime* off Vercel to Cloudflare’s own compute (Pages/Workers) is **non-trivial** for this app because:

- It uses **Prisma** with a standard Node.js client (`provider = "prisma-client-js"`).
- Many APIs assume a **Node.js server environment**, not the Workers runtime.
- Some internal tools use **`@vercel/sandbox`** and `child_process`, which do **not** exist on Cloudflare Workers.

You should treat this as a **separate project** with the following high-level tasks:

1. **Decide runtime target**
   - **Option A**: Cloudflare **Pages + Next.js (Next on Pages)** with a database that supports Workers/HTTP drivers.
   - **Option B**: Cloudflare **Workers** + a dedicated API backend (or Prisma Data Proxy / Accelerate) for DB access.

2. **Make Prisma Workers-compatible**
   - Investigate **Prisma’s edge / Data Proxy / Accelerate** support for Cloudflare at the time you do this.
   - Migrate `src/lib/db.ts` away from a local `PrismaClient` instance to a **proxy / HTTP-based** access layer that works in Workers.

3. **Remove or guard Vercel-specific features**
   - `src/lib/sandbox.ts` and `@vercel/sandbox` are Vercel-only.  
   - Calls guarded by `process.env.VERCEL` (see `src/lib/agent/engine.ts`) must be **disabled or replaced** in any Cloudflare runtime.

4. **Introduce Cloudflare config**
   - Add a `wrangler.toml` and any Next-on-Pages / OpenNext config recommended by Cloudflare’s current Next.js guide.
   - Adjust `package.json` to add Cloudflare build/preview/deploy scripts alongside the existing Vercel flow.

5. **Deploy & test on a Cloudflare preview URL**
   - Connect the GitHub repo to **Workers & Pages**.
   - Configure build command (`npx prisma generate && next build` or the adapter’s build command).
   - Set all env vars in the Cloudflare project.
   - Use the `*.pages.dev` / `*.workers.dev` URL for smoke tests before swapping DNS to point directly to Cloudflare as the runtime.

Because this phase requires runtime changes and possibly DB adapter changes, it should be done **after** Phase 1 is stable.

---

## Quick Checklist – What’s Already Verified in This Repo

- ✅ `npm run build` succeeds locally (runs `npx prisma generate && next build`).  
- ✅ `next.config.ts` is simple (only image domains + a custom header for `/code`), no Vercel-only features.  
- ✅ `vercel.json` only configures `framework` and build/install commands – no rewrites that need porting.  

So you can safely:

- Put **Cloudflare in front as DNS/CDN/WAF today** with **no code changes**.
- Plan a later, deliberate rewrite for a **full Cloudflare runtime** if/when you want to drop Vercel entirely.

