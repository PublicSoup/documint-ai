import '../api_client.dart';
import '../models/billing_product.dart';
import '../models/subscription_info.dart';

/// Talks to /api/user/subscription and /api/mobile/billing/** on the backend.
class BillingRepository {
  BillingRepository(this._client);
  final ApiClient _client;

  Future<SubscriptionInfo> getSubscription() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/user/subscription');
    return SubscriptionInfo.fromJson(json);
  }

  Future<List<BillingProduct>> getProducts() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/mobile/billing/products');
    final raw = json['products'] as List<dynamic>? ?? const [];
    return raw.map((p) => BillingProduct.fromJson(p as Map<String, dynamic>)).toList();
  }

  /// Sends the store's purchase proof to the backend for server-side
  /// verification. `verificationData` is the plugin's
  /// `serverVerificationData` (Apple receipt / Google purchase token).
  Future<void> verifyPurchase({
    required String platform, // "apple" | "google"
    required String productId,
    required String verificationData,
  }) async {
    await _client.postJson<Map<String, dynamic>>(
      '/api/mobile/billing/verify',
      body: {
        'platform': platform,
        'productId': productId,
        'verificationData': verificationData,
      },
    );
  }
}
