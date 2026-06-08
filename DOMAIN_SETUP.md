# Domain & Deployment Setup Guide

This guide explains how to deploy **DocuMint AI** to Vercel and connect your domain `documintai.dev`.

## 1. Deploy to Vercel

1.  Push your code to GitHub (see instructions below).
2.  Log in to [Vercel](https://vercel.com).
3.  Click **"Add New..."** -> **"Project"**.
4.  Import your `documint-ai` repository.
5.  In "Environment Variables", add:
    *   `DATABASE_URL`: (Your database connection string)
    *   `NEXTAUTH_SECRET`: (A random string)
    *   `NEXTAUTH_URL`: `https://documintai.dev`
    *   `STRIPE_SECRET_KEY`: (From Stripe Dashboard)
    *   `STRIPE_WEBHOOK_SECRET`: (From Stripe Webhooks)
6.  Click **Deploy**.

## 2. Connect Your Domain

1.  In your Vercel Project, go to **Settings** -> **Domains**.
2.  Enter `documintai.dev` and click **Add**.
3.  Vercel will give you the DNS records to set up.

## 3. Update DNS Records

Go to your domain registrar (where you bought `documintai.dev`) and update the DNS:

| Type  | Name | Value |
| :--- | :--- | :--- |
| **A** | `@` | `76.76.21.21` |
| **CNAME** | `www` | `cname.vercel-dns.com` |

## 4. Final Verification

1.  Wait ~5 minutes for DNS propagation.
2.  Visit `https://documintai.dev`.
3.  Ensure your **Stripe** settings in "Business Details" list `https://documintai.dev` as your website.

## 5. Google Cloud OAuth — Authorized Redirect URIs

The app's `NEXTAUTH_URL` is set to `https://www.documintai.dev` (with `www.`).
NextAuth builds each provider's OAuth callback URI as `${NEXTAUTH_URL}/api/auth/callback/<provider>`,
so you **must** register the `www.` variant in Google Cloud Console.

In **APIs & Services → Credentials → OAuth 2.0 Client IDs → your Web client → Authorized redirect URIs**, add:

| Provider | URI |
| :--- | :--- |
| Google | `https://www.documintai.dev/api/auth/callback/google` |
| Google (apex, optional) | `https://documintai.dev/api/auth/callback/google` |
| GitHub | `https://www.documintai.dev/api/auth/callback/github` |

> A `400: redirect_uri_mismatch` error from Google means the URI NextAuth sends
> (driven by `NEXTAUTH_URL`) is **not** in this list. The exact URI being sent
> is logged at app boot as `[next-auth] OAuth callback URIs in use: ...`.
