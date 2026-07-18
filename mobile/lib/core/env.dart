/// API base URL, overridable per build via `--dart-define=API_URL=...`
/// (e.g. `flutter run --dart-define=API_URL=http://10.0.2.2:3000` to point
/// the Android emulator at a local `next dev` server — 10.0.2.2 is the
/// emulator's alias for the host machine's localhost).
///
/// Defaults to production so a release build works out of the box without
/// any extra configuration.
class Env {
  static const String apiUrl = String.fromEnvironment(
    'API_URL',
    defaultValue: 'https://www.documintai.dev',
  );
}
