/// Mirrors GET /api/docs/[id] (src/app/api/docs/[id]/route.ts) — the route
/// param is actually a fileId, not a Documentation id.
class DocFileRef {
  final String name;
  final String language;

  const DocFileRef({required this.name, required this.language});

  factory DocFileRef.fromJson(Map<String, dynamic> json) => DocFileRef(
        name: json['name'] as String,
        language: json['language'] as String? ?? 'plaintext',
      );
}

class Documentation {
  final String id;
  final String fileId;
  final String content;
  final String status; // DRAFT | REVIEW | APPROVED
  final String updatedAt;
  final String? verifiedAt;
  final DocFileRef file;

  const Documentation({
    required this.id,
    required this.fileId,
    required this.content,
    required this.status,
    required this.updatedAt,
    required this.verifiedAt,
    required this.file,
  });

  factory Documentation.fromJson(Map<String, dynamic> json) => Documentation(
        id: json['id'] as String,
        fileId: json['fileId'] as String,
        content: json['content'] as String? ?? '',
        status: json['status'] as String? ?? 'DRAFT',
        updatedAt: json['updatedAt'] as String,
        verifiedAt: json['verifiedAt'] as String?,
        file: DocFileRef.fromJson(json['file'] as Map<String, dynamic>),
      );
}
