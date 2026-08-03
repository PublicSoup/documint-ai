import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'repositories/account_repository.dart';
import 'repositories/analytics_repository.dart';
import 'repositories/auth_repository.dart';
import 'repositories/billing_repository.dart';
import 'repositories/chat_repository.dart';
import 'repositories/docs_repository.dart';
import 'repositories/files_repository.dart';
import 'repositories/notifications_repository.dart';
import 'repositories/reviews_repository.dart';
import 'repositories/sandbox_repository.dart';
import 'repositories/search_repository.dart';
import 'repositories/teams_repository.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient.instance);

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(ref.watch(apiClientProvider)));

final filesRepositoryProvider = Provider<FilesRepository>((ref) => FilesRepository(ref.watch(apiClientProvider)));

final docsRepositoryProvider = Provider<DocsRepository>((ref) => DocsRepository(ref.watch(apiClientProvider)));

final billingRepositoryProvider = Provider<BillingRepository>((ref) => BillingRepository(ref.watch(apiClientProvider)));

final chatRepositoryProvider = Provider<ChatRepository>((ref) => ChatRepository(ref.watch(apiClientProvider)));

final accountRepositoryProvider = Provider<AccountRepository>((ref) => AccountRepository(ref.watch(apiClientProvider)));

final teamsRepositoryProvider = Provider<TeamsRepository>((ref) => TeamsRepository(ref.watch(apiClientProvider)));

final reviewsRepositoryProvider = Provider<ReviewsRepository>((ref) => ReviewsRepository(ref.watch(apiClientProvider)));

final searchRepositoryProvider = Provider<SearchRepository>((ref) => SearchRepository(ref.watch(apiClientProvider)));

final notificationsRepositoryProvider = Provider<NotificationsRepository>((ref) => NotificationsRepository(ref.watch(apiClientProvider)));

final analyticsRepositoryProvider = Provider<AnalyticsRepository>((ref) => AnalyticsRepository(ref.watch(apiClientProvider)));

final sandboxRepositoryProvider = Provider<SandboxRepository>((ref) => SandboxRepository(ref.watch(apiClientProvider)));
