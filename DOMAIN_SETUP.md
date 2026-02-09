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
