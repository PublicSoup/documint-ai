/// Mirrors GET /api/analytics/docs (subset the mobile screen renders).
class TopDoc {
  final String id;
  final String name;
  final int views;
  const TopDoc({required this.id, required this.name, required this.views});
  factory TopDoc.fromJson(Map<String, dynamic> j) =>
      TopDoc(id: j['id'] as String? ?? '', name: j['name'] as String? ?? '', views: (j['views'] as num?)?.toInt() ?? 0);
}

class DocsAnalytics {
  final int totalFiles;
  final int totalViews;
  final int docsCreatedThisMonth;
  final int coverageDocumented;
  final int coverageTotal;
  final int coveragePercentage;
  final List<TopDoc> topDocs;

  const DocsAnalytics({
    required this.totalFiles,
    required this.totalViews,
    required this.docsCreatedThisMonth,
    required this.coverageDocumented,
    required this.coverageTotal,
    required this.coveragePercentage,
    required this.topDocs,
  });

  factory DocsAnalytics.fromJson(Map<String, dynamic> json) {
    final overview = json['overview'] as Map<String, dynamic>? ?? const {};
    final coverage = json['coverage'] as Map<String, dynamic>? ?? const {};
    return DocsAnalytics(
      totalFiles: (overview['totalFiles'] as num?)?.toInt() ?? 0,
      totalViews: (overview['totalViews'] as num?)?.toInt() ?? 0,
      docsCreatedThisMonth: (overview['docsCreatedThisMonth'] as num?)?.toInt() ?? 0,
      coverageDocumented: (coverage['documented'] as num?)?.toInt() ?? 0,
      coverageTotal: (coverage['total'] as num?)?.toInt() ?? 0,
      coveragePercentage: (coverage['percentage'] as num?)?.toInt() ?? 0,
      topDocs: (json['topDocs'] as List<dynamic>? ?? const [])
          .map((e) => TopDoc.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
