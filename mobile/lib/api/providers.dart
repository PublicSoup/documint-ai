import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_client.dart';
import 'repositories/auth_repository.dart';
import 'repositories/docs_repository.dart';
import 'repositories/files_repository.dart';

final apiClientProvider = Provider<ApiClient>((ref) => ApiClient.instance);

final authRepositoryProvider = Provider<AuthRepository>((ref) => AuthRepository(ref.watch(apiClientProvider)));

final filesRepositoryProvider = Provider<FilesRepository>((ref) => FilesRepository(ref.watch(apiClientProvider)));

final docsRepositoryProvider = Provider<DocsRepository>((ref) => DocsRepository(ref.watch(apiClientProvider)));
