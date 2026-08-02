/// Mirrors an entry from GET /api/chat/sessions
/// (src/app/api/chat/sessions/route.ts). `messages` is NOT in the list
/// response — only `messageCount`; the full transcript comes from the
/// detail route.
class ChatSessionSummary {
  final String id;
  final String title;
  final String? model;
  final int messageCount;
  final String updatedAt;

  const ChatSessionSummary({
    required this.id,
    required this.title,
    required this.model,
    required this.messageCount,
    required this.updatedAt,
  });

  factory ChatSessionSummary.fromJson(Map<String, dynamic> json) => ChatSessionSummary(
        id: json['id'] as String,
        title: (json['title'] as String?)?.trim().isNotEmpty == true ? json['title'] as String : 'New chat',
        model: json['model'] as String?,
        messageCount: (json['messageCount'] as num?)?.toInt() ?? 0,
        updatedAt: json['updatedAt'] as String? ?? '',
      );
}
