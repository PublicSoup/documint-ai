/// Mirrors an entry from GET /api/admin/users.
class AdminUser {
  final String id;
  final String? name;
  final String? email;
  final String role;
  final String? plan;
  final int fileCount;
  final String createdAt;

  const AdminUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.plan,
    required this.fileCount,
    required this.createdAt,
  });

  factory AdminUser.fromJson(Map<String, dynamic> json) {
    final subscription = json['subscription'] as Map<String, dynamic>?;
    final counts = json['_count'] as Map<String, dynamic>?;
    return AdminUser(
      id: json['id'] as String,
      name: json['name'] as String?,
      email: json['email'] as String?,
      role: json['role'] as String? ?? 'USER',
      plan: subscription?['plan'] as String?,
      fileCount: (counts?['files'] as num?)?.toInt() ?? 0,
      createdAt: json['createdAt'] as String? ?? '',
    );
  }
}
