import '../api_client.dart';
import '../models/search_result.dart';

/// Talks to /api/search.
class SearchRepository {
  SearchRepository(this._client);
  final ApiClient _client;

  Future<List<SearchResult>> search(String query, {String type = 'all'}) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/search', query: {'q': query, 'type': type});
    final raw = json['results'] as List<dynamic>? ?? const [];
    return raw.map((r) => SearchResult.fromJson(r as Map<String, dynamic>)).toList();
  }
}
