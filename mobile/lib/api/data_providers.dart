import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'api_exception.dart';
import 'models/documentation.dart';
import 'models/file_summary.dart';
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
