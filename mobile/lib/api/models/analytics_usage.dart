/// Mirrors GET /api/analytics/usage.
class UsagePoint {
  final String date;
  final int calls;
  const UsagePoint({required this.date, required this.calls});
  factory UsagePoint.fromJson(Map<String, dynamic> j) =>
      UsagePoint(date: j['date'] as String? ?? '', calls: (j['calls'] as num?)?.toInt() ?? 0);
}

class ActionCount {
  final String action;
  final int count;
  const ActionCount({required this.action, required this.count});
  factory ActionCount.fromJson(Map<String, dynamic> j) =>
      ActionCount(action: j['action'] as String? ?? '', count: (j['count'] as num?)?.toInt() ?? 0);
}

class UsageAnalytics {
  final String period;
  final int totalCalls;
  final int totalViews;
  final int filesCreated;
  final int avgDailyCalls;
  final List<UsagePoint> chartData;
  final List<ActionCount> actionBreakdown;

  const UsageAnalytics({
    required this.period,
    required this.totalCalls,
    required this.totalViews,
    required this.filesCreated,
    required this.avgDailyCalls,
    required this.chartData,
    required this.actionBreakdown,
  });

  factory UsageAnalytics.fromJson(Map<String, dynamic> json) {
    final summary = json['summary'] as Map<String, dynamic>? ?? const {};
    return UsageAnalytics(
      period: json['period'] as String? ?? '7d',
      totalCalls: (summary['totalCalls'] as num?)?.toInt() ?? 0,
      totalViews: (summary['totalViews'] as num?)?.toInt() ?? 0,
      filesCreated: (summary['filesCreated'] as num?)?.toInt() ?? 0,
      avgDailyCalls: (summary['avgDailyCalls'] as num?)?.toInt() ?? 0,
      chartData: (json['chartData'] as List<dynamic>? ?? const [])
          .map((e) => UsagePoint.fromJson(e as Map<String, dynamic>))
          .toList(),
      actionBreakdown: (json['actionBreakdown'] as List<dynamic>? ?? const [])
          .map((e) => ActionCount.fromJson(e as Map<String, dynamic>))
          .toList(),
    );
  }
}
