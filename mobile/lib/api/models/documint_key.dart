/// Mirrors an entry from GET /api/keys (the external DocuMint API key,
/// distinct from BYO AI provider keys). The full key is only ever returned
/// once, from POST — GET returns a masked form.
class DocuMintKey {
  final String id;
  final String name;
  final String maskedKey;
  final String? createdAt;

  const DocuMintKey({required this.id, required this.name, required this.maskedKey, required this.createdAt});

  factory DocuMintKey.fromJson(Map<String, dynamic> json) => DocuMintKey(
        id: json['id'] as String? ?? 'primary',
        name: json['name'] as String? ?? 'API Key',
        maskedKey: json['maskedKey'] as String? ?? '',
        createdAt: json['createdAt'] as String?,
      );
}
