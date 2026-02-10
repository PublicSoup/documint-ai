# Supabase Database Setup Guide

To fix the "localhost" error, we need a production-ready PostgreSQL database. We will use **Supabase**.

## Step 1: Create a Project
1.  Go to [database.new](https://database.new) (redirects to Supabase).
2.  If asked, sign in with GitHub.
3.  Create a **New Project**.
    -   **Name**: `DocuMint-Prod`
    -   **Database Password**: `Generate a strong password and SAVE IT`.
    -   **Region**: Choose one close to `Washington, D.C. (us-east-1)` for best performance with Vercel.
4.  Click **Create user**.

## Step 2: Get Connection Strings
Once the project is created (it takes ~1 minute):

1.  Go to **Project Settings** (gear icon) -> **Database**.
2.  Scroll down to **Connection Parameters**.
3.  You need **two** URLs:

    **A. Transaction Pooler (For `DATABASE_URL`)**
    -   Find **Connection String**.
    -   Switch Mode to **Transaction**.
    -   Copy the URI (starts with `postgresql://...:6543/...`).
    -   *Address*: `aws-0-us-east-1.pooler.supabase.com` (or similar).
    -   *Port*: `6543`.

    **B. Session Mode (For `DIRECT_URL`)**
    -   Switch Mode to **Session**.
    -   Copy the URI (starts with `postgresql://...:5432/...`).
    -   *Address*: `db...supabase.co`.
    -   *Port*: `5432`.

## Step 3: Provide to Agent
Reply to the chat with:

```
DATABASE_URL=postgresql://postgres.your-ref:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.your-ref:PASSWORD@db.your-ref.supabase.co:5432/postgres
```

(Replace `PASSWORD` with your actual database password)
