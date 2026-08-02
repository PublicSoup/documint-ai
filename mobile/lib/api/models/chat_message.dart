/// One entry in the agent's process log shown under an assistant message —
/// built from streaming `thought`/`tool_call`/`tool_result`/`file_created`/
/// `command_event`/`error_report` events, or from a stored message's
/// `thoughtSteps` when loading history.
class ThoughtStep {
  final String type;
  final String content;
  final String? toolName;

  const ThoughtStep({required this.type, required this.content, this.toolName});

  factory ThoughtStep.fromStored(Map<String, dynamic> json) => ThoughtStep(
        type: json['type'] as String? ?? 'thought',
        content: json['content'] as String? ?? '',
        toolName: json['toolName'] as String?,
      );
}

/// A chat message for the UI. `content` and the flags are mutable because an
/// assistant message is built up incrementally as `response` events stream
/// in. User messages are simple and final.
class ChatMessage {
  final String id;
  final String role; // "user" | "assistant"
  String content;
  final List<ThoughtStep> steps;
  String? previewUrl;
  bool isStreaming;
  bool isError;

  ChatMessage({
    required this.id,
    required this.role,
    this.content = '',
    List<ThoughtStep>? steps,
    this.previewUrl,
    this.isStreaming = false,
    this.isError = false,
  }) : steps = steps ?? [];

  bool get isUser => role == 'user';

  /// Maps a StoredChatMessage (from GET /api/chat/sessions/[id]) into the UI model.
  factory ChatMessage.fromStored(Map<String, dynamic> json) {
    final rawSteps = json['thoughtSteps'] as List<dynamic>? ?? const [];
    return ChatMessage(
      id: json['id'] as String? ?? DateTime.now().microsecondsSinceEpoch.toString(),
      role: json['role'] as String? ?? 'assistant',
      content: json['content'] as String? ?? '',
      steps: rawSteps.map((s) => ThoughtStep.fromStored(s as Map<String, dynamic>)).toList(),
      previewUrl: json['previewUrl'] as String?,
    );
  }
}
