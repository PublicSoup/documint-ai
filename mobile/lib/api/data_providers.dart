import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_exception.dart';
import 'models/ai_model.dart';
import 'models/app_notification.dart';
import 'models/billing_product.dart';
import 'models/chat_session_summary.dart';
import 'models/documentation.dart';
import 'models/file_summary.dart';
import 'models/provider_keys.dart';
import 'models/review.dart';
import 'models/subscription_info.dart';
import 'models/team.dart';
import 'providers.dart';

final filesListProvider = FutureProvider.autoDispose<List<FileSummary>>((ref) {
  return ref.watch(filesRepositoryProvider).listFiles();
});

final fileContentProvider = FutureProvider.autoDispose.family<String, String>((ref, fileId) {
  return ref.watch(filesRepositoryProvider).getFileContent(fileId);
});

/// Returns `null` when no documentation has been generated yet (404) rather
/// than surfacing that as an error state — every other failure still throws.
final documentationProvider = FutureProvider.autoDispose.family<Documentation?, String>((ref, fileId) async {
  try {
    return await ref.watch(docsRepositoryProvider).getDocumentation(fileId);
  } on ApiException catch (e) {
    if (e.isNotFound) return null;
    rethrow;
  }
});

final subscriptionProvider = FutureProvider.autoDispose<SubscriptionInfo>((ref) {
  return ref.watch(billingRepositoryProvider).getSubscription();
});

final billingProductsProvider = FutureProvider.autoDispose<List<BillingProduct>>((ref) {
  return ref.watch(billingRepositoryProvider).getProducts();
});

final chatSessionsProvider = FutureProvider.autoDispose<List<ChatSessionSummary>>((ref) {
  return ref.watch(chatRepositoryProvider).listSessions();
});

/// Available AI models for the picker. Returns an empty list (rather than
/// throwing) if the catalog can't be loaded, so the picker just hides.
final aiModelsProvider = FutureProvider.autoDispose<List<AiModel>>((ref) async {
  try {
    return await ref.watch(chatRepositoryProvider).listModels();
  } catch (_) {
    return const [];
  }
});

final teamsProvider = FutureProvider.autoDispose<List<Team>>((ref) {
  return ref.watch(teamsRepositoryProvider).listTeams();
});

final teamDetailProvider = FutureProvider.autoDispose.family<Team, String>((ref, teamId) {
  return ref.watch(teamsRepositoryProvider).getTeam(teamId);
});

final reviewsProvider = FutureProvider.autoDispose<List<Review>>((ref) {
  return ref.watch(reviewsRepositoryProvider).listReviews();
});

final notificationsProvider = FutureProvider.autoDispose<List<AppNotification>>((ref) {
  return ref.watch(notificationsRepositoryProvider).list();
});

final providerKeysProvider = FutureProvider.autoDispose<ProviderKeyStatus>((ref) {
  return ref.watch(accountRepositoryProvider).getProviderKeys();
});
