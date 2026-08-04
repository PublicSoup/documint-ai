/// Mirrors an entry from GET /api/audit. Non-admins are auto-scoped by the
/// backend to their own entries; admins see everything.
class AuditLogEntry {
  final String id;
  final String action;
  final String entity;
  final String severity;
  final String? actorName;
  final String? actorEmail;
  final String createdAt;

  const AuditLogEntry({
    required this.id,
    required this.action,
    required this.entity,
    required this.severity,
    required this.actorName,
    required this.actorEmail,
    required this.createdAt,
  });

  factory AuditLogEntry.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>?;
    return AuditLogEntry(
      id: json['id'] as String,
      action: json['action'] as String? ?? '',
      entity: json['entity'] as String? ?? '',
      severity: json['severity'] as String? ?? 'INFO',
      actorName: user?['name'] as String?,
      actorEmail: user?['email'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}
