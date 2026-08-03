import '../api_client.dart';
import '../models/app_notification.dart';

/// Talks to /api/notifications.
class NotificationsRepository {
  NotificationsRepository(this._client);
  final ApiClient _client;

  Future<List<AppNotification>> list() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/notifications', query: {'limit': 50});
    final raw = json['notifications'] as List<dynamic>? ?? const [];
    return raw.map((n) => AppNotification.fromJson(n as Map<String, dynamic>)).toList();
  }

  Future<void> markRead(String id) async {
    await _client.dio.patch('/api/notifications', data: {'id': id});
  }

  Future<void> markAllRead() async {
    await _client.dio.patch('/api/notifications', data: {'markAllRead': true});
  }

  Future<void> delete(String id) async {
    await _client.dio.delete('/api/notifications', queryParameters: {'id': id});
  }
}
