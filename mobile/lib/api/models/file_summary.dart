/// Mirrors the row shape returned by GET /api/files/list
/// (src/app/api/files/list/route.ts).
class FileSummary {
  final String id;
  final String name;
  final String language;
  final int size;
  final String createdAt;
  final String updatedAt;

  const FileSummary({
    required this.id,
    required this.name,
    required this.language,
    required this.size,
    required this.createdAt,
    required this.updatedAt,
  });

  factory FileSummary.fromJson(Map<String, dynamic> json) => FileSummary(
        id: json['id'] as String,
        name: json['name'] as String,
        language: json['language'] as String? ?? 'plaintext',
        size: (json['size'] as num?)?.toInt() ?? 0,
        createdAt: json['createdAt'] as String,
        updatedAt: json['updatedAt'] as String,
      );
}
