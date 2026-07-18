import '../api_client.dart';
import '../models/file_summary.dart';

/// Talks to src/app/api/files/** on the backend.
class FilesRepository {
  FilesRepository(this._client);
  final ApiClient _client;

  Future<List<FileSummary>> listFiles() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/files/list', query: {'limit': 100});
    final rawFiles = json['files'] as List<dynamic>? ?? const [];
    return rawFiles.map((f) => FileSummary.fromJson(f as Map<String, dynamic>)).toList();
  }

  Future<String> getFileContent(String fileId) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/files/$fileId/raw');
    return json['content'] as String? ?? '';
  }

  Future<void> updateFileContent(String fileId, String content) async {
    await _client.putJson<dynamic>('/api/files/$fileId/raw', body: {'content': content});
  }
}
