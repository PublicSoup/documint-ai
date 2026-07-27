import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:in_app_purchase/in_app_purchase.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../api/models/billing_product.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';

/// Native subscription paywall. Prices and the purchase sheet come from the
/// platform store (Apple StoreKit / Google Play Billing) via
/// `in_app_purchase`; the purchase proof is then verified server-side
/// (/api/mobile/billing/verify) before the plan is unlocked. Stripe is
/// deliberately NOT used in-app — the stores require their own billing for
/// digital subscriptions.
class BillingScreen extends ConsumerStatefulWidget {
  const BillingScreen({super.key});

  @override
  ConsumerState<BillingScreen> createState() => _BillingScreenState();
}

class _BillingScreenState extends ConsumerState<BillingScreen> {
  final _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSub;

  bool _storeAvailable = true;
  bool _loadingStore = true;
  String? _storeError;
  String? _statusMessage;
  String? _purchasingProductId;

  /// Store-provided details (localized price, title) keyed by product id.
  Map<String, ProductDetails> _storeProducts = {};

  String get _platform => Platform.isIOS ? 'apple' : 'google';

  @override
  void initState() {
    super.initState();
    _purchaseSub = _iap.purchaseStream.listen(
      _onPurchaseUpdates,
      onError: (Object e) => setState(() => _statusMessage = 'Purchase stream error: $e'),
    );
    _initStore();
  }

  @override
  void dispose() {
    _purchaseSub?.cancel();
    super.dispose();
  }

  Future<void> _initStore() async {
    final available = await _iap.isAvailable();
    if (!available) {
      if (mounted) {
        setState(() {
          _storeAvailable = false;
          _loadingStore = false;
        });
      }
      return;
    }

    // Load the backend product catalog first, then ask the store for the
    // matching localized ProductDetails.
    try {
      final backendProducts = await ref.read(billingProductsProvider.future);
      final ids = backendProducts.map((p) => p.productId).toSet();
      final response = await _iap.queryProductDetails(ids);

      if (mounted) {
        setState(() {
          _storeProducts = {for (final pd in response.productDetails) pd.id: pd};
          _storeError = response.error?.message;
          _loadingStore = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _storeError = e is ApiException ? e.message : 'Failed to load products.';
          _loadingStore = false;
        });
      }
    }
  }

  Future<void> _onPurchaseUpdates(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      switch (purchase.status) {
        case PurchaseStatus.pending:
          setState(() => _purchasingProductId = purchase.productID);
          break;
        case PurchaseStatus.error:
          setState(() {
            _purchasingProductId = null;
            _statusMessage = purchase.error?.message ?? 'Purchase failed.';
          });
          if (purchase.pendingCompletePurchase) await _iap.completePurchase(purchase);
          break;
        case PurchaseStatus.canceled:
          setState(() {
            _purchasingProductId = null;
            _statusMessage = null;
          });
          if (purchase.pendingCompletePurchase) await _iap.completePurchase(purchase);
          break;
        case PurchaseStatus.purchased:
        case PurchaseStatus.restored:
          await _verifyAndComplete(purchase);
          break;
      }
    }
  }

  Future<void> _verifyAndComplete(PurchaseDetails purchase) async {
    try {
      await ref.read(billingRepositoryProvider).verifyPurchase(
            platform: _platform,
            productId: purchase.productID,
            verificationData: purchase.verificationData.serverVerificationData,
          );
      ref.invalidate(subscriptionProvider);
      if (mounted) {
        setState(() {
          _purchasingProductId = null;
          _statusMessage = 'Subscription activated. Thank you!';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _purchasingProductId = null;
          _statusMessage = e is ApiException ? e.message : 'Could not verify purchase.';
        });
      }
    } finally {
      // Always finalize with the store so the transaction isn't re-delivered.
      if (purchase.pendingCompletePurchase) await _iap.completePurchase(purchase);
    }
  }

  Future<void> _buy(BillingProduct product) async {
    final storeProduct = _storeProducts[product.productId];
    if (storeProduct == null) return;
    setState(() {
      _statusMessage = null;
      _purchasingProductId = product.productId;
    });
    final param = PurchaseParam(productDetails: storeProduct);
    await _iap.buyNonConsumable(purchaseParam: param);
  }

  @override
  Widget build(BuildContext context) {
    final subscriptionAsync = ref.watch(subscriptionProvider);
    final productsAsync = ref.watch(billingProductsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Billing'),
        actions: [
          TextButton(
            onPressed: _storeAvailable ? () => _iap.restorePurchases() : null,
            child: const Text('Restore'),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(subscriptionProvider);
          await ref.read(subscriptionProvider.future);
        },
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            subscriptionAsync.when(
              loading: () => const Card(child: Padding(padding: EdgeInsets.all(20), child: Center(child: CircularProgressIndicator()))),
              error: (e, _) => Card(child: Padding(padding: const EdgeInsets.all(16), child: Text(e is ApiException ? e.message : 'Failed to load plan.'))),
              data: (sub) => Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Current plan', style: Theme.of(context).textTheme.bodySmall),
                      const SizedBox(height: 4),
                      Text(sub.displayPlan, style: Theme.of(context).textTheme.titleMedium),
                      if (sub.isActive && sub.plan != 'free') ...[
                        const SizedBox(height: 4),
                        const Text('Active', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w600)),
                      ],
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 16),
            if (!_storeAvailable)
              _InfoCard(
                text: 'In-app purchases are not available on this device. Subscriptions can be managed from the '
                    'App Store / Google Play account this app is signed into.',
              )
            else if (_loadingStore)
              const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator()))
            else ...[
              if (_storeError != null) _InfoCard(text: _storeError!),
              productsAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (e, _) => _InfoCard(text: e is ApiException ? e.message : 'Failed to load products.'),
                data: (products) {
                  final currentPlan = subscriptionAsync.valueOrNull?.plan ?? 'free';
                  return Column(
                    children: [
                      for (final product in products)
                        _PlanCard(
                          product: product,
                          storeProduct: _storeProducts[product.productId],
                          isCurrent: product.plan == currentPlan && (subscriptionAsync.valueOrNull?.isActive ?? false),
                          isPurchasing: _purchasingProductId == product.productId,
                          onSubscribe: () => _buy(product),
                        ),
                    ],
                  );
                },
              ),
            ],
            if (_statusMessage != null) ...[
              const SizedBox(height: 8),
              Text(_statusMessage!, textAlign: TextAlign.center, style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 16),
            Text(
              'Payment is charged to your App Store or Google Play account. Subscriptions renew automatically '
              'unless canceled at least 24 hours before the end of the period. Manage or cancel in your store account settings.',
              style: Theme.of(context).textTheme.bodySmall,
              textAlign: TextAlign.center,
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({
    required this.product,
    required this.storeProduct,
    required this.isCurrent,
    required this.isPurchasing,
    required this.onSubscribe,
  });

  final BillingProduct product;
  final ProductDetails? storeProduct;
  final bool isCurrent;
  final bool isPurchasing;
  final VoidCallback onSubscribe;

  @override
  Widget build(BuildContext context) {
    final unavailable = storeProduct == null;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(product.name, style: Theme.of(context).textTheme.titleMedium),
                if (storeProduct != null)
                  Text(storeProduct!.price, style: const TextStyle(color: AppColors.primary, fontWeight: FontWeight.w700, fontSize: 18)),
              ],
            ),
            if (product.description.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(product.description, style: Theme.of(context).textTheme.bodySmall),
            ],
            const SizedBox(height: 12),
            for (final feature in product.features)
              Padding(
                padding: const EdgeInsets.only(bottom: 6),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.check, size: 16, color: AppColors.success),
                    const SizedBox(width: 8),
                    Expanded(child: Text(feature, style: Theme.of(context).textTheme.bodyMedium)),
                  ],
                ),
              ),
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: isCurrent
                  ? OutlinedButton(onPressed: null, child: const Text('Current Plan'))
                  : ElevatedButton(
                      onPressed: unavailable || isPurchasing ? null : onSubscribe,
                      child: isPurchasing
                          ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.primaryForeground))
                          : Text(unavailable ? 'Unavailable' : 'Subscribe'),
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _InfoCard extends StatelessWidget {
  const _InfoCard({required this.text});
  final String text;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Text(text, style: Theme.of(context).textTheme.bodySmall),
      ),
    );
  }
}
