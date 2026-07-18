import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/models/mobile_user.dart';
import '../api/providers.dart';
import 'session_storage.dart';

/// Holds the signed-in user (or null) for the whole app. Screens gate on
/// `authControllerProvider` via go_router's redirect logic (see router.dart)
/// rather than each screen checking auth individually.
class AuthController extends AsyncNotifier<MobileUser?> {
  @override
  Future<MobileUser?> build() async {
    // A terminal 401 (access token invalid AND refresh failed) means the
    // session is gone server-side (revoked/expired) — drop local state too
    // so the router falls back to the auth screens.
    ref.read(apiClientProvider).onUnauthorized = () {
      state = const AsyncData(null);
    };

    final session = await SessionStorage.instance.read();
    return session?.user;
  }

  Future<void> login({required String email, required String password}) async {
    final repo = ref.read(authRepositoryProvider);
    final session = await repo.login(email: email, password: password);
    await SessionStorage.instance.write(session);
    state = AsyncData(session.user);
  }

  Future<void> register({required String name, required String email, required String password}) async {
    final repo = ref.read(authRepositoryProvider);
    await repo.registerAccount(name: name, email: email, password: password);
    await login(email: email, password: password);
  }

  Future<void> logout() async {
    final session = await SessionStorage.instance.read();
    await SessionStorage.instance.clear();
    state = const AsyncData(null);

    if (session != null) {
      final repo = ref.read(authRepositoryProvider);
      unawaited(repo.logout(session.refreshToken).catchError((_) {}));
    }
  }
}

final authControllerProvider = AsyncNotifierProvider<AuthController, MobileUser?>(AuthController.new);
