/// Mirrors GET /api/user/subscription (src/app/api/user/subscription/route.ts).
class SubscriptionInfo {
  final String plan; // free | starter | pro | team
  final bool isPro;
  final bool isTeam;
  final bool isActive;

  const SubscriptionInfo({
    required this.plan,
    required this.isPro,
    required this.isTeam,
    required this.isActive,
  });

  factory SubscriptionInfo.fromJson(Map<String, dynamic> json) => SubscriptionInfo(
        plan: json['plan'] as String? ?? 'free',
        isPro: json['isPro'] as bool? ?? false,
        isTeam: json['isTeam'] as bool? ?? false,
        isActive: json['isActive'] as bool? ?? false,
      );

  String get displayPlan => plan.isEmpty ? 'Free' : '${plan[0].toUpperCase()}${plan.substring(1)}';
}
