import 'mobile_user.dart';

/// Mirrors `MobileSession` returned by `src/app/api/mobile/auth/*` routes.
class MobileSession {
  final String accessToken;
  final String refreshToken;
  final String expiresAt;
  final MobileUser user;

  const MobileSession({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresAt,
    required this.user,
  });

  factory MobileSession.fromJson(Map<String, dynamic> json) => MobileSession(
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        expiresAt: json['expiresAt'] as String,
        user: MobileUser.fromJson(json['user'] as Map<String, dynamic>),
      );

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'expiresAt': expiresAt,
        'user': user.toJson(),
      };

  MobileSession copyWithTokens({required String accessToken, required String refreshToken}) => MobileSession(
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresAt: expiresAt,
        user: user,
      );
}
