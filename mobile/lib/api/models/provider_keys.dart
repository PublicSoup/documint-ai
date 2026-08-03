/// Mirrors GET /api/user/api-key — which BYO AI provider keys are set (the
/// keys themselves are never returned) plus the monthly AI usage counters.
class ProviderKeyStatus {
  final bool hasKey;
  final int queryCount;
  final int quota;
  final int tokenCount;
  final int tokenQuota;
  final Map<String, bool> providers;

  const ProviderKeyStatus({
    required this.hasKey,
    required this.queryCount,
    required this.quota,
    required this.tokenCount,
    required this.tokenQuota,
    required this.providers,
  });

  /// The provider identifiers the backend accepts (src/lib/ai-usage.ts).
  static const providerIds = ['google', 'anthropic', 'openai', 'xai', 'deepseek', 'openrouter', 'custom'];

  factory ProviderKeyStatus.fromJson(Map<String, dynamic> json) {
    final usage = json['usage'] as Map<String, dynamic>? ?? const {};
    final rawProviders = usage['providers'] as Map<String, dynamic>? ?? const {};
    return ProviderKeyStatus(
      hasKey: json['hasKey'] as bool? ?? false,
      queryCount: (usage['queryCount'] as num?)?.toInt() ?? 0,
      quota: (usage['quota'] as num?)?.toInt() ?? 0,
      tokenCount: (usage['tokenCount'] as num?)?.toInt() ?? 0,
      tokenQuota: (usage['tokenQuota'] as num?)?.toInt() ?? 0,
      providers: {for (final id in providerIds) id: rawProviders[id] as bool? ?? false},
    );
  }
}
