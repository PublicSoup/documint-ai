# Domain & Deployment Setup Guide (Railway + Cloudflare)

DocuMint AI is deployed on **Railway** (Docker, `railway.json`), fronted by **Cloudflare**,
with **`documintai.dev` (apex) as the canonical origin**. Vercel is no longer used.

## Canonical origin

| Purpose | Value |
| :--- | :--- |
| `NEXTAUTH_URL` | `https://documintai.dev` |
| `NEXT_PUBLIC_APP_URL` | `https://documintai.dev` |
| Google OAuth callback | `https://documintai.dev/api/auth/callback/google` |
| GitHub OAuth callback | `https://documintai.dev/api/auth/callback/github` |
| Stripe webhook | `https://documintai.dev/api/webhooks/stripe` |
| Inngest app URL | `https://documintai.dev` |

## 1. Cloudflare DNS

| Type | Name | Value | Proxy |
| :--- | :--- | :--- | :--- |
| A / CNAME | `@` | Railway edge (see Railway → Settings → Networking) | Proxied |
| CNAME | `www` | `documintai.dev` (flattened to apex) | Proxied |

> The old `www` CNAME pointed at `*.vercel-dns-016.com` and served a Vercel
> `DEPLOYMENT_DISABLED` (HTTP 402) page. It must stay pointed at Cloudflare/apex, not Vercel.

## 2. Railway

1. Service → **Settings → Networking**: add `documintai.dev` and `www.documintai.dev` as
   custom domains (TLS is issued automatically).
2. **Variables**: `NEXTAUTH_URL` and `NEXT_PUBLIC_APP_URL` must both be
   `https://documintai.dev`. A mismatch makes NextAuth build OAuth callback URLs on the
   wrong origin and breaks sign-in.
3. Redeploy after changing variables.

## 3. Database (Supabase)

- `DATABASE_URL` — pooled connection (Supavisor, port `6543`, `?pgbouncer=true&connection_limit=1`).
- `DIRECT_URL` — session pooler (port `5432`), used by Prisma Migrate.
- Free-tier Supabase projects **auto-pause after inactivity**. When paused, the pooler
  returns `tenant/user <ref> not found`, the app's `/api/health` reports
  `"database": "unhealthy"` (HTTP 503), and **sign-in fails with an AccessDenied-style
  error** because the OAuth `signIn` callback cannot upsert the user. Restore the project
  in the Supabase dashboard to recover.
- Rotate the DB password in Project Settings → Database and update both URLs in Railway
  after rotating.

## 4. Google Cloud OAuth — Authorized Redirect URIs

NextAuth builds each provider's callback as `${NEXTAUTH_URL}/api/auth/callback/<provider>`.
Register these in **APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs**:

| Provider | URI |
| :--- | :--- |
| Google | `https://documintai.dev/api/auth/callback/google` |
| GitHub | `https://documintai.dev/api/auth/callback/github` |

> A `400: redirect_uri_mismatch` from Google means the URI NextAuth sends (driven by
> `NEXTAUTH_URL`) is not in this list. The exact URIs are logged at boot as
> `[next-auth] OAuth callback URIs in use: ...`.
> If the consent screen is in **Testing** mode, add your Google account under
> **Test users** — otherwise Google blocks sign-in with "you don't have permission".
