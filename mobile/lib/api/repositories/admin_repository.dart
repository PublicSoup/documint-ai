import '../api_client.dart';
import '../models/admin_health.dart';
import '../models/admin_user.dart';
import '../models/audit_log.dart';

/// Talks to /api/admin/** and /api/audit. Admin routes return 403 for
/// non-admins (401 when unauthenticated); the audit route is additionally
/// feature-gated and self-scopes for non-admins.
class AdminRepository {
  AdminRepository(this._client);
  final ApiClient _client;

  Future<AdminHealth> health() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/admin/health');
    return AdminHealth.fromJson(json);
  }

  Future<List<AdminUser>> users({String? search}) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/admin/users', query: {
      'limit': 50,
      'search': ?search,
    });
    final raw = json['users'] as List<dynamic>? ?? const [];
    return raw.map((u) => AdminUser.fromJson(u as Map<String, dynamic>)).toList();
  }

  Future<List<AuditLogEntry>> auditLog() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/audit', query: {'limit': 50});
    final raw = json['logs'] as List<dynamic>? ?? const [];
    return raw.map((l) => AuditLogEntry.fromJson(l as Map<String, dynamic>)).toList();
  }
}
