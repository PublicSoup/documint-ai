/// Mirrors an entry from GET /api/mobile/billing/products
/// (src/app/api/mobile/billing/products/route.ts). Localized pricing is NOT
/// here — it comes from the store SDK (`ProductDetails.price`) on-device.
class BillingProduct {
  final String productId;
  final String plan;
  final String name;
  final String description;
  final List<String> features;

  const BillingProduct({
    required this.productId,
    required this.plan,
    required this.name,
    required this.description,
    required this.features,
  });

  factory BillingProduct.fromJson(Map<String, dynamic> json) => BillingProduct(
        productId: json['productId'] as String,
        plan: json['plan'] as String,
        name: json['name'] as String? ?? '',
        description: json['description'] as String? ?? '',
        features: (json['features'] as List<dynamic>? ?? const []).map((e) => e.toString()).toList(),
      );
}
