/// Mirrors a result from GET /api/search.
class SearchResult {
  final String type; // file | code | doc
  final String id;
  final String title;
  final String subtitle;
  final String match; // filename | code | documentation
  final String? snippet;

  const SearchResult({
    required this.type,
    required this.id,
    required this.title,
    required this.subtitle,
    required this.match,
    required this.snippet,
  });

  factory SearchResult.fromJson(Map<String, dynamic> json) => SearchResult(
        type: json['type'] as String? ?? 'file',
        id: json['id'] as String,
        title: json['title'] as String? ?? '',
        subtitle: json['subtitle'] as String? ?? '',
        match: json['match'] as String? ?? '',
        snippet: json['snippet'] as String?,
      );
}
