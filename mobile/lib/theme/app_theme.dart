import 'package:flutter/material.dart';

/// Transcribed from the web app's shadcn "new-york" tokens
/// (src/app/globals.css `:root`) — the web app is dark-themed only (no
/// `.dark` variant / light-mode toggle exists there), so the mobile app
/// matches that rather than inventing a light theme the product doesn't have.
class AppColors {
  static const background = Color(0xFF09090B);
  static const foreground = Color(0xFFFAFAFA);
  static const card = Color(0xFF0A0A0C);
  static const primary = Color(0xFF995AF2);
  static const primaryForeground = Color(0xFFF8FAFC);
  static const secondary = Color(0xFF27272A);
  static const mutedForeground = Color(0xFFA1A1AA);
  static const destructive = Color(0xFFF04242);
  static const border = Color(0xFF27272A);
  static const success = Color(0xFF22C55E);
  static const warning = Color(0xFFF59E0B);

  // Deep indigo/black IDE surfaces (src/app/globals.css --ide-bg*), used
  // only by IDE screens (Phase 3+) rather than the general app chrome.
  static const ideBackground = Color(0xFF030014);
  static const ideElevated = Color(0xFF04001A);
  static const ideSurface = Color(0xFF06001F);
}

class AppRadius {
  static const sm = 8.0;
  static const md = 10.0;
  static const lg = 12.0;
}

ThemeData buildAppTheme() {
  final colorScheme = const ColorScheme.dark(
    surface: AppColors.background,
    primary: AppColors.primary,
    onPrimary: AppColors.primaryForeground,
    secondary: AppColors.secondary,
    onSurface: AppColors.foreground,
    error: AppColors.destructive,
  );

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: AppColors.background,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.background,
      foregroundColor: AppColors.foreground,
      elevation: 0,
      scrolledUnderElevation: 0,
    ),
    cardTheme: CardThemeData(
      color: AppColors.card,
      elevation: 0,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadius.lg),
        side: const BorderSide(color: AppColors.border),
      ),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.secondary,
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(AppRadius.md),
        borderSide: BorderSide.none,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      hintStyle: const TextStyle(color: AppColors.mutedForeground),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.primary,
        foregroundColor: AppColors.primaryForeground,
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
        textStyle: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.foreground,
        side: const BorderSide(color: AppColors.border),
        padding: const EdgeInsets.symmetric(vertical: 14),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppRadius.md)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(
      style: TextButton.styleFrom(foregroundColor: AppColors.primary),
    ),
    bottomNavigationBarTheme: const BottomNavigationBarThemeData(
      backgroundColor: AppColors.card,
      selectedItemColor: AppColors.primary,
      unselectedItemColor: AppColors.mutedForeground,
      type: BottomNavigationBarType.fixed,
    ),
    dividerTheme: const DividerThemeData(color: AppColors.border),
    textTheme: const TextTheme(
      titleLarge: TextStyle(color: AppColors.foreground, fontWeight: FontWeight.w800, fontSize: 28),
      titleMedium: TextStyle(color: AppColors.foreground, fontWeight: FontWeight.w700, fontSize: 20),
      bodyLarge: TextStyle(color: AppColors.foreground, fontSize: 16),
      bodyMedium: TextStyle(color: AppColors.foreground, fontSize: 14),
      bodySmall: TextStyle(color: AppColors.mutedForeground, fontSize: 13),
      labelLarge: TextStyle(color: AppColors.foreground, fontWeight: FontWeight.w600, fontSize: 14),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.primary),
  );
}
