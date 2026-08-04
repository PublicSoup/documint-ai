import '../api_client.dart';

/// Talks to POST /api/diagram/generate. Returns raw Mermaid source; the
/// backend fetches the file's content itself, so only the id + type go over
/// the wire. Feature-gated (403) for non-Pro plans.
class DiagramsRepository {
  DiagramsRepository(this._client);
  final ApiClient _client;

  /// [type] is one of: class, sequence, flowchart, state, er.
  Future<String> generate({required String fileId, required String type}) async {
    final json = await _client.postJson<Map<String, dynamic>>(
      '/api/diagram/generate',
      body: {'fileId': fileId, 'type': type},
    );
    return json['diagram'] as String? ?? '';
  }
}
