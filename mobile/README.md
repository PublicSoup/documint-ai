# DocuMint Mobile (Capacitor shell)

Native **iOS + Android** wrapper around the hosted DocuMint web app. This folder
is self-contained and intentionally isolated from the Next.js web build — nothing
here ships to Vercel.

## How it works

DocuMint is a server-rendered Next.js app (API routes, auth, database), so it
can't be exported into a static native bundle. Instead the native shell loads the
live deployment via Capacitor's `server.url` (see `capacitor.config.ts`). The
`www/` folder is only the offline fallback screen.

**Code execution on mobile:** the in-browser WebContainer runtime the desktop IDE
uses cannot start inside an iOS/Android WebView (it needs SharedArrayBuffer +
cross-origin isolation). On native platforms the IDE automatically routes
`node`/`static` project runs to the **server-side Vercel Sandbox** instead — see
[`src/lib/platform/native.ts`](../src/lib/platform/native.ts) and
[`src/app/api/ide/sandbox/run/route.ts`](../src/app/api/ide/sandbox/run/route.ts).

## Prerequisites

- **Node 18+** and this folder's deps: `cd mobile && npm install`
- **iOS:** macOS + Xcode + CocoaPods (`sudo gem install cocoapods`)
- **Android:** Android Studio + JDK 17 + an SDK/emulator

## First-time setup

```bash
cd mobile
npm install

# Generate the native projects (needs the SDKs above).
npm run add:ios
npm run add:android

# Copy web assets + config into the native projects.
npm run sync
```

## Deep links (required for social login)

Google/GitHub sign-in runs in the system browser and returns to the app via the
`documintai://` custom scheme (see `src/lib/native-auth.ts`). After `cap add`,
register the scheme in each native project:

**iOS** — in `ios/App/App/Info.plist`:

```xml
<key>CFBundleURLTypes</key>
<array>
  <dict>
    <key>CFBundleURLName</key>
    <string>dev.documintai.app</string>
    <key>CFBundleURLSchemes</key>
    <array><string>documintai</string></array>
  </dict>
</array>
```

**Android** — inside the main `<activity>` in `android/app/src/main/AndroidManifest.xml`:

```xml
<intent-filter>
  <action android:name="android.intent.action.VIEW" />
  <category android:name="android.intent.category.DEFAULT" />
  <category android:name="android.intent.category.BROWSABLE" />
  <data android:scheme="documintai" android:host="auth" />
</intent-filter>
```

Email/password sign-in works in the WebView with no extra setup.

## Run it

```bash
# Open in the native IDE to build/run on a simulator or device:
npm run open:ios       # → Xcode
npm run open:android   # → Android Studio

# …or launch directly onto a connected device/emulator:
npm run run:ios
npm run run:android
```

## Point at a different backend

Load a preview deployment or a dev server on your LAN instead of production:

```bash
CAP_SERVER_URL="http://192.168.1.20:3000" npm run sync
```

Then rebuild from Xcode / Android Studio. (Using an `http://` LAN URL also
requires enabling cleartext for that host — see `capacitor.config.ts`.)

## Notes

- `ios/` and `android/` are gitignored until you start customizing native code
  (icons, splash, entitlements). Un-ignore them in `.gitignore` when you do.
- App id: `dev.documintai.app` · App name: `DocuMint` — change in
  `capacitor.config.ts` before the first `cap add`.
