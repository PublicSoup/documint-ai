/// The subset of GET /api/admin/health the mobile screen renders. The full
/// response also carries extensive ops telemetry (health-signal volatility,
/// policy-mismatch digests) that a read-only mobile view has no use for.
class HealthComponent {
  final String name;
  final String status;
  final String severity;

  const HealthComponent({required this.name, required this.status, required this.severity});
}

class AdminHealth {
  final String status; // healthy | degraded
  final String severity; // healthy | degraded | critical
  final int opsReadinessScore;
  final String opsReadinessBand;
  final int totalUsers;
  final List<String> degradedComponents;
  final List<String> recommendedActions;
  final List<HealthComponent> components;
  final String timestamp;

  const AdminHealth({
    required this.status,
    required this.severity,
    required this.opsReadinessScore,
    required this.opsReadinessBand,
    required this.totalUsers,
    required this.degradedComponents,
    required this.recommendedActions,
    required this.components,
    required this.timestamp,
  });

  factory AdminHealth.fromJson(Map<String, dynamic> json) {
    final rawComponents = json['components'] as Map<String, dynamic>? ?? const {};
    final components = <HealthComponent>[];
    rawComponents.forEach((name, value) {
      if (value is Map<String, dynamic>) {
        components.add(HealthComponent(
          name: name,
          status: value['status'] as String? ?? 'unknown',
          severity: value['severity'] as String? ?? 'unknown',
        ));
      }
    });

    final database = rawComponents['database'] as Map<String, dynamic>?;
    final stats = database?['stats'] as Map<String, dynamic>?;

    return AdminHealth(
      status: json['status'] as String? ?? 'unknown',
      severity: json['severity'] as String? ?? 'unknown',
      opsReadinessScore: (json['opsReadinessScore'] as num?)?.toInt() ?? 0,
      opsReadinessBand: json['opsReadinessBand'] as String? ?? '',
      totalUsers: (stats?['totalUsers'] as num?)?.toInt() ?? 0,
      degradedComponents: (json['degradedComponents'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      recommendedActions: (json['recommendedActions'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      components: components,
      timestamp: json['timestamp'] as String? ?? '',
    );
  }
}
