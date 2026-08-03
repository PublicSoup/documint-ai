import '../api_client.dart';
import '../models/analytics_docs.dart';
import '../models/analytics_usage.dart';

/// Talks to /api/analytics/usage and /api/analytics/docs (both feature-gated
/// → 403 for non-entitled plans; callers surface an upgrade prompt).
class AnalyticsRepository {
  AnalyticsRepository(this._client);
  final ApiClient _client;

  Future<UsageAnalytics> getUsage({String period = '7d'}) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/analytics/usage', query: {'period': period});
    return UsageAnalytics.fromJson(json);
  }

  Future<DocsAnalytics> getDocs({int days = 30}) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/analytics/docs', query: {'days': days});
    return DocsAnalytics.fromJson(json);
  }
}
