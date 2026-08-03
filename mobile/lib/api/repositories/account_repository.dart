import '../api_client.dart';
import '../models/documint_key.dart';
import '../models/provider_keys.dart';

/// Talks to /api/user/update, /api/user/api-key (BYO provider keys) and
/// /api/keys (the DocuMint external API key).
class AccountRepository {
  AccountRepository(this._client);
  final ApiClient _client;

  Future<void> updateProfile({String? name, String? currentPassword, String? newPassword}) async {
    await _client.dio.patch('/api/user/update', data: {
      'name': ?name,
      'currentPassword': ?currentPassword,
      'newPassword': ?newPassword,
    });
  }

  Future<ProviderKeyStatus> getProviderKeys() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/user/api-key');
    return ProviderKeyStatus.fromJson(json);
  }

  Future<void> setProviderKey({required String provider, required String apiKey, String? baseUrl, String? modelId}) async {
    await _client.postJson<Map<String, dynamic>>('/api/user/api-key', body: {
      'provider': provider,
      'apiKey': apiKey,
      'baseUrl': ?baseUrl,
      'modelId': ?modelId,
    });
  }

  Future<void> deleteProviderKey(String provider) async {
    await _client.dio.delete('/api/user/api-key', queryParameters: {'provider': provider});
  }

  Future<List<DocuMintKey>> getDocuMintKeys() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/keys');
    final raw = json['keys'] as List<dynamic>? ?? const [];
    return raw.map((k) => DocuMintKey.fromJson(k as Map<String, dynamic>)).toList();
  }

  /// Generates/rotates the DocuMint API key. The full key is returned once.
  Future<String> generateDocuMintKey({String? name}) async {
    final json = await _client.postJson<Map<String, dynamic>>('/api/keys', body: {'name': ?name});
    return json['key'] as String? ?? '';
  }
}
