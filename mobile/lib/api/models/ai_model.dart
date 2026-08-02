/// Mirrors an entry from GET /api/ai/models (src/lib/ai-model-catalog.ts).
class AiModel {
  final String id;
  final String label;
  final String provider;
  final String tier;

  const AiModel({required this.id, required this.label, required this.provider, required this.tier});

  factory AiModel.fromJson(Map<String, dynamic> json) => AiModel(
        id: json['id'] as String,
        label: json['label'] as String? ?? json['id'] as String,
        provider: json['provider'] as String? ?? '',
        tier: json['tier'] as String? ?? '',
      );
}
