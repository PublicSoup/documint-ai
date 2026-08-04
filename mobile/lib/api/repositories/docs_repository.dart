import '../api_client.dart';
import '../models/documentation.dart';

/// Talks to src/app/api/docs/[id] and src/app/api/ide/auto-document on the
/// backend ("[id]" in the docs route is actually a fileId).
class DocsRepository {
  DocsRepository(this._client);
  final ApiClient _client;

  Future<Documentation> getDocumentation(String fileId) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/docs/$fileId');
    return Documentation.fromJson(json['doc'] as Map<String, dynamic>);
  }

  Future<void> generateDocumentation(String fileId, {bool force = false}) async {
    await _client.postJson<dynamic>(
      '/api/ide/auto-document',
      body: {'fileId': fileId, if (force) 'force': true},
    );
  }

  /// Toggles public sharing for a file's documentation and returns the
  /// public URL (`<app>/share/<fileId>`). Requires "manage" permission on
  /// the file (403) and existing documentation (400).
  Future<String> setPublicShare(String fileId, {required bool isPublic}) async {
    final json = await _client.postJson<Map<String, dynamic>>(
      '/api/docs/$fileId/share',
      body: {'isPublic': isPublic},
    );
    return json['url'] as String? ?? '';
  }
}
