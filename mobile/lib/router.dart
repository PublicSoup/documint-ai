import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'auth/auth_controller.dart';
import 'features/analytics/analytics_screen.dart';
import 'features/chat/chat_screen.dart';
import 'features/dashboard/file_detail_screen.dart';
import 'features/dashboard/file_list_screen.dart';
import 'features/ide/code_editor_screen.dart';
import 'features/ide/ide_screen.dart';
import 'features/more/more_screen.dart';
import 'auth/login_screen.dart';
import 'auth/register_screen.dart';
import 'auth/forgot_password_screen.dart';
import 'auth/reset_password_screen.dart';
import 'widgets/app_shell.dart';

/// Bridges Riverpod's [AuthController] state into a [Listenable] go_router
/// can watch for `redirect` re-evaluation — go_router itself has no
/// Riverpod awareness, so this is the standard glue between the two.
class _AuthRefreshNotifier extends ChangeNotifier {
  _AuthRefreshNotifier(Ref ref) {
    ref.listen(authControllerProvider, (_, _) => notifyListeners());
  }
}

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = _AuthRefreshNotifier(ref);

  return GoRouter(
    initialLocation: '/dashboard',
    refreshListenable: refresh,
    redirect: (context, state) {
      final authState = ref.read(authControllerProvider);
      if (authState.isLoading) return null; // wait for the initial session read

      final isSignedIn = authState.valueOrNull != null;
      final isAuthRoute = state.matchedLocation.startsWith('/login') ||
          state.matchedLocation.startsWith('/register') ||
          state.matchedLocation.startsWith('/forgot-password') ||
          state.matchedLocation.startsWith('/reset-password');

      if (!isSignedIn && !isAuthRoute) return '/login';
      if (isSignedIn && isAuthRoute) return '/dashboard';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (context, state) => const LoginScreen()),
      GoRoute(path: '/register', builder: (context, state) => const RegisterScreen()),
      GoRoute(path: '/forgot-password', builder: (context, state) => const ForgotPasswordScreen()),
      GoRoute(
        path: '/reset-password',
        builder: (context, state) => ResetPasswordScreen(initialToken: state.uri.queryParameters['token']),
      ),
      StatefulShellRoute.indexedStack(
        builder: (context, state, navigationShell) => AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/dashboard',
              builder: (context, state) => const FileListScreen(),
              routes: [
                GoRoute(
                  path: ':fileId',
                  builder: (context, state) => FileDetailScreen(fileId: state.pathParameters['fileId']!),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/ide',
              builder: (context, state) => const IdeScreen(),
              routes: [
                GoRoute(
                  path: ':fileId',
                  builder: (context, state) => CodeEditorScreen(
                    fileId: state.pathParameters['fileId']!,
                    fileName: state.extra as String?,
                  ),
                ),
              ],
            ),
          ]),
          StatefulShellBranch(routes: [GoRoute(path: '/chat', builder: (context, state) => const ChatScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/analytics', builder: (context, state) => const AnalyticsScreen())]),
          StatefulShellBranch(routes: [GoRoute(path: '/more', builder: (context, state) => const MoreScreen())]),
        ],
      ),
    ],
  );
});
