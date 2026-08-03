/// Mirrors the Notification model returned by GET /api/notifications.
class AppNotification {
  final String id;
  final String type; // MENTION | INVITE | SYSTEM
  final String message;
  final String? link;
  final bool read;
  final String createdAt;

  const AppNotification({
    required this.id,
    required this.type,
    required this.message,
    required this.link,
    required this.read,
    required this.createdAt,
  });

  factory AppNotification.fromJson(Map<String, dynamic> json) => AppNotification(
        id: json['id'] as String,
        type: json['type'] as String? ?? 'SYSTEM',
        message: json['message'] as String? ?? '',
        link: json['link'] as String?,
        read: json['read'] as bool? ?? false,
        createdAt: json['createdAt'] as String? ?? '',
      );
}
