import '../api_client.dart';
import '../models/mobile_session.dart';

/// Talks to src/app/api/mobile/auth/** and src/app/api/register,
/// src/app/api/auth/reset-password on the backend.
class AuthRepository {
  AuthRepository(this._client);
  final ApiClient _client;

  Future<MobileSession> login({required String email, required String password}) async {
    final json = await _client.postJson<Map<String, dynamic>>(
      '/api/mobile/auth/login',
      body: {'email': email, 'password': password},
      skipAuth: true,
    );
    return MobileSession.fromJson(json);
  }

  Future<void> registerAccount({required String name, required String email, required String password}) async {
    await _client.postJson<dynamic>(
      '/api/register',
      body: {'name': name, 'email': email, 'password': password},
      skipAuth: true,
    );
  }

  Future<void> logout(String refreshToken) async {
    // Best-effort server-side revocation — callers clear local state
    // regardless of whether this succeeds.
    await _client.postJson<dynamic>(
      '/api/mobile/auth/logout',
      body: {'refreshToken': refreshToken},
      skipAuth: true,
    );
  }

  Future<String> requestPasswordReset(String email) async {
    final json = await _client.postJson<Map<String, dynamic>>(
      '/api/auth/reset-password',
      body: {'email': email},
      skipAuth: true,
    );
    return json['message'] as String? ?? 'If an account with that email exists, a reset link has been sent.';
  }

  Future<String> confirmPasswordReset({required String token, required String password}) async {
    final json = await _client.putJson<Map<String, dynamic>>(
      '/api/auth/reset-password',
      body: {'token': token, 'password': password},
      skipAuth: true,
    );
    return json['message'] as String? ?? 'Password reset successfully.';
  }
}
