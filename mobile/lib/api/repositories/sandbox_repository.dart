import '../api_client.dart';
import '../models/sandbox_run_result.dart';

/// Talks to POST /api/ide/sandbox/run (Vercel Sandbox execution).
class SandboxRepository {
  SandboxRepository(this._client);
  final ApiClient _client;

  Future<SandboxRunResult> run({
    required String fileName,
    required String content,
    required String runtimeKind,
  }) async {
    final json = await _client.postJson<Map<String, dynamic>>('/api/ide/sandbox/run', body: {
      'files': [
        {'name': fileName, 'content': content},
      ],
      'runtimeKind': runtimeKind,
      'entryFile': fileName,
      'port': 3000,
    });
    return SandboxRunResult.fromJson(json);
  }
}
