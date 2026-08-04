# Testing the DocuMint AI mobile app

Two ways to get the app onto a device: **download a build from CI** (no local
setup) or **run it yourself** from your Mac (needed for hot reload and iOS
device installs).

---

## Option A — Install a CI build (no setup)

Every push that touches `mobile/**` runs the **Mobile** workflow
(`.github/workflows/mobile.yml`) and publishes artifacts.

1. GitHub → **Actions** → **Mobile** → open the latest run.
2. Download from **Artifacts**:
   - `documint-android-debug-apk` — an `.apk` for any Android phone.
   - `documint-ios-simulator-app` — a `.zip` for the iOS Simulator on a Mac.

**Android phone:** transfer the `.apk`, tap it, and allow "install from unknown
sources" when prompted.

**iOS Simulator (Mac):**
```bash
unzip Runner-simulator.zip
open -a Simulator                 # boot any iPhone simulator first
xcrun simctl install booted Runner.app
xcrun simctl launch booted dev.documintai.documint_mobile
```

To build against a different backend, use **Run workflow** on the Actions tab
and set the `api_url` input.

> An iOS build for a **physical iPhone** can't come from CI — Apple requires
> signing with your own developer team. Use Option B for that.

---

## Option B — Run it from your Mac

### One-time setup

```bash
brew install --cask flutter          # or https://docs.flutter.dev/get-started
flutter --version                    # expect 3.44.x
flutter doctor                       # follow anything it flags
```

For iOS you also need **Xcode** (from the App Store), then:
```bash
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch
```
For Android you need **Android Studio** (installs the SDK + an emulator).

### Run

```bash
cd mobile
flutter pub get
flutter devices          # list simulators/emulators/attached phones
flutter run              # or: flutter run -d <device-id>
```

`r` hot-reloads, `R` restarts, `q` quits.

### Pointing at a backend

The API base URL is compiled in and defaults to production
(`https://www.documintai.dev`, see `lib/core/env.dart`). Override it:

```bash
# iOS Simulator against a local `npm run dev`
flutter run --dart-define=API_URL=http://localhost:3000

# Android emulator — 10.0.2.2 is the emulator's alias for your Mac
flutter run --dart-define=API_URL=http://10.0.2.2:3000

# A physical phone on the same Wi-Fi — use your Mac's LAN IP
flutter run --dart-define=API_URL=http://192.168.1.42:3000
```

Plain HTTP is deliberately allowed only for local/LAN addresses (Android via a
debug-only manifest flag, iOS via `NSAllowsLocalNetworking`). Release builds
are HTTPS-only.

### Installing on a physical iPhone

```bash
open ios/Runner.xcworkspace
```
In Xcode: select **Runner** → **Signing & Capabilities** → pick your Apple ID
as **Team**. The bundle ID `dev.documintai.documint_mobile` may need a unique
suffix if someone else has claimed it. Then `flutter run -d <your-iphone>`.

---

## What to exercise first

The pieces most likely to behave differently on a real device — they're the
WebView- and native-backed surfaces, and none of them can be verified in CI:

| Area | Why it's worth checking |
|---|---|
| Sign in / sign out | Tokens go through the iOS Keychain / Android Keystore |
| IDE → open a file | Monaco loads in a WebView (needs network for the editor JS) |
| IDE → **Run** on a `.py`/`.go`/`.sh` file | Server sandbox execution + live preview |
| Diagrams → generate | Mermaid renders in a WebView |
| AI Chat → send a message | Streamed NDJSON response, incremental rendering |
| File → **Share** | Native share sheet |
| More → Billing | Store products only resolve in a **TestFlight / Play internal test** build signed with the real bundle ID — see `IAP_SETUP.md`. Expect "unavailable" in a plain debug build. |

## Known limitations

- **Billing** needs store-side setup before it does anything (`IAP_SETUP.md`).
- **Run/preview** supports Python, PHP, Go, Java, Rust and Shell. JavaScript,
  TypeScript and static sites run only in the web app's browser-based
  WebContainer, which can't work on mobile.
- **Admin** is read-only on mobile by design; role changes stay on the web.
- Push notifications and deep links aren't implemented yet.
