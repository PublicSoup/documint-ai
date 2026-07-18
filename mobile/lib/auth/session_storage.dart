import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../api/models/mobile_session.dart';

/// Persists the mobile session (see src/lib/mobile-auth.ts /
/// src/lib/mobile-auth-tokens.ts on the backend) in the platform
/// Keychain/Keystore via `flutter_secure_storage`.
///
/// The whole session (tokens + user) is stored as one JSON blob so app
/// launch can restore the signed-in user synchronously from disk without an
/// extra "who am I" round trip before the first screen renders.
class SessionStorage {
  SessionStorage._();
  static final SessionStorage instance = SessionStorage._();

  static const _sessionKey = 'documint.session';

  final _storage = const FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<MobileSession?> read() async {
    final raw = await _storage.read(key: _sessionKey);
    if (raw == null) return null;

    try {
      return MobileSession.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<void> write(MobileSession session) async {
    await _storage.write(key: _sessionKey, value: jsonEncode(session.toJson()));
  }

  Future<void> clear() async {
    await _storage.delete(key: _sessionKey);
  }
}
