import '../api_client.dart';
import '../models/ai_model.dart';
import '../models/chat_message.dart';
import '../models/chat_session_summary.dart';

/// Talks to /api/chat, /api/chat/sessions/**, and /api/ai/models on the backend.
class ChatRepository {
  ChatRepository(this._client);
  final ApiClient _client;

  Future<List<ChatSessionSummary>> listSessions() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/chat/sessions');
    final raw = json['sessions'] as List<dynamic>? ?? const [];
    return raw.map((s) => ChatSessionSummary.fromJson(s as Map<String, dynamic>)).toList();
  }

  /// Returns the persisted transcript for a session as UI messages.
  Future<List<ChatMessage>> getSessionMessages(String sessionId) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/chat/sessions/$sessionId');
    final raw = json['messages'] as List<dynamic>? ?? const [];
    return raw.map((m) => ChatMessage.fromStored(m as Map<String, dynamic>)).toList();
  }

  Future<void> deleteSession(String sessionId) async {
    await _client.dio.delete('/api/chat/sessions/$sessionId');
  }

  Future<void> renameSession(String sessionId, String title) async {
    await _client.dio.patch('/api/chat/sessions/$sessionId', data: {'title': title});
  }

  Future<List<AiModel>> listModels() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/ai/models');
    final raw = json['models'] as List<dynamic>? ?? const [];
    return raw.map((m) => AiModel.fromJson(m as Map<String, dynamic>)).toList();
  }

  /// Opens the streaming chat request. Emits one string per NDJSON line; the
  /// caller parses each into an agent event. History entries are
  /// `{role, content}` (roles user/assistant/system, ≤30 entries server-side).
  Future<Stream<String>> streamChat({
    required String message,
    required List<Map<String, String>> history,
    String? sessionId,
    String? model,
  }) {
    return _client.postStreamLines('/api/chat', body: {
      'message': message,
      'history': history,
      'sessionId': ?sessionId,
      'model': ?model,
    });
  }
}
