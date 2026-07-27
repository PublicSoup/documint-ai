# In-App Purchase Setup (iOS + Android)

DocuMint's mobile subscriptions use **native in-app purchases** — Apple
StoreKit on iOS and Google Play Billing on Android — because both stores
require their own billing for digital subscriptions and reject apps that use
an external processor (e.g. Stripe) for them. Stripe stays in use for the
**web** app only.

The app code is complete; the remaining steps are store-side account
configuration only **you** can do (they require your developer accounts and
generate secret credentials). Nothing below can be done from the codebase.

## 1. Product IDs (must match exactly)

The backend maps these product IDs to plans in
`src/lib/iap/products.ts`. Create an **auto-renewable subscription** with
each of these exact IDs in **both** stores:

| Product ID | Plan |
|---|---|
| `dev.documintai.sub.starter.monthly` | Starter |
| `dev.documintai.sub.pro.monthly` | Pro |
| `dev.documintai.sub.team.monthly` | Team |

If you prefer different IDs, change them in `src/lib/iap/products.ts` and keep
both stores in sync with that file.

## 2. Apple (App Store Connect)

1. Enroll in the Apple Developer Program ($99/yr) if you haven't.
2. Create the app with bundle id `dev.documintai.documint_mobile` (this is the
   Flutter project's `ios` bundle id; change in Xcode if you want a different
   one, and update `APPLE_IAP_BUNDLE_ID`).
3. App Store Connect → your app → **Subscriptions** → create a subscription
   group and add the three products above.
4. App Store Connect → your app → **App Information** →
   **App-Specific Shared Secret** → generate. Set it as `APPLE_IAP_SHARED_SECRET`.
5. Testing: create a **Sandbox tester** account (Users and Access → Sandbox)
   and sign into it on the device. The backend automatically retries Apple's
   sandbox endpoint, so sandbox purchases verify without code changes.

## 3. Google (Play Console)

1. Create a Google Play developer account ($25 one-time) if you haven't.
2. Create the app with package name `dev.documintai.documint_mobile`
   (matches the Flutter `android` applicationId; set `GOOGLE_PLAY_PACKAGE_NAME`).
3. Play Console → **Monetize → Products → Subscriptions** → create the three
   products above with the same IDs.
4. Create a **service account** with Play access:
   - Google Cloud Console → IAM → Service Accounts → create one → create a
     **JSON key**.
   - Play Console → **Users and permissions** → invite that service account,
     grant **View financial data** + **Manage orders and subscriptions**.
   - Set the entire JSON key file contents as `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.
5. Testing: add license testers in Play Console and use an internal-testing
   track build.

## 4. Server environment variables

Add to your deployment (Vercel, etc.). All are optional — until they're set,
the mobile billing endpoints return `503` and the app shows purchases as
unavailable, but nothing else breaks.

```
APPLE_IAP_SHARED_SECRET=...
APPLE_IAP_BUNDLE_ID=dev.documintai.documint_mobile
GOOGLE_PLAY_PACKAGE_NAME=dev.documintai.documint_mobile
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON={...the full service-account JSON...}
```

## 5. How verification works (for reference)

- The app buys via the store SDK (`in_app_purchase`) and receives a purchase
  proof (`serverVerificationData`: an App Store receipt on iOS, a purchase
  token on Android).
- It sends `{ platform, productId, verificationData }` to
  `POST /api/mobile/billing/verify`.
- The backend verifies with Apple's `verifyReceipt`
  (`src/lib/iap/apple.ts`) or the Google Play Developer API
  (`src/lib/iap/google.ts`), then activates the plan on the user's existing
  `Subscription` row — the same row/columns the web Stripe flow uses, so plan
  gating works identically everywhere.

## 6. Recommended hardening (follow-up, not required to ship)

- **Server notifications** so renewals/cancellations/refunds update the plan
  without the app re-verifying: Apple **App Store Server Notifications V2** and
  Google **Real-time Developer Notifications** (Pub/Sub). Add these as
  `/api/webhooks/apple` and `/api/webhooks/google` handlers that call the same
  `src/lib/iap/verify.ts` logic.
- Migrate Apple verification from the classic `verifyReceipt` endpoint to the
  **App Store Server API** (transaction-id + signed `JWS`) — more robust and
  Apple's long-term recommended path.
