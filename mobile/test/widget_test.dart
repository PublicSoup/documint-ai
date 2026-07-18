import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:documint_mobile/theme/app_theme.dart';
import 'package:documint_mobile/widgets/coming_soon.dart';

// The generated counter-demo smoke test pumped MyApp() (which no longer
// exists) end-to-end, including AuthController's flutter_secure_storage
// read — a platform channel not available in the widget-test harness
// without additional mocking. These tests cover what's exercisable without
// that: the theme builds, and a plain, dependency-free widget renders.

void main() {
  test('buildAppTheme produces a dark, Material 3 theme', () {
    final theme = buildAppTheme();
    expect(theme.useMaterial3, isTrue);
    expect(theme.brightness, Brightness.dark);
    expect(theme.colorScheme.primary, AppColors.primary);
  });

  testWidgets('ComingSoon renders its title and description', (tester) async {
    await tester.pumpWidget(const MaterialApp(
      home: ComingSoon(title: 'AI Chat', description: 'Coming soon.'),
    ));

    expect(find.text('AI Chat'), findsOneWidget);
    expect(find.text('Coming soon.'), findsOneWidget);
  });
}
