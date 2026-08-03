/// Mirrors the JSON error body every route emits via `errorResponse()`
/// (src/lib/api-utils.ts): `{ error, message, code, details }`.
class ApiException implements Exception {
  final int statusCode;
  final String error;
  final String message;
  final String? code;
  final dynamic details;

  const ApiException({
    required this.statusCode,
    required this.error,
    required this.message,
    this.code,
    this.details,
  });

  factory ApiException.fromResponse(int statusCode, dynamic body) {
    if (body is Map<String, dynamic>) {
      return ApiException(
        statusCode: statusCode,
        error: body['error'] as String? ?? 'Error',
        message: body['message'] as String? ?? 'Request failed',
        code: body['code'] as String?,
        details: body['details'],
      );
    }

    return ApiException(statusCode: statusCode, error: 'Error', message: 'Request failed');
  }

  bool get isUnauthorized => statusCode == 401;
  bool get isPaymentRequired => statusCode == 402;
  bool get isForbidden => statusCode == 403;
  bool get isNotFound => statusCode == 404;

  /// True for the feature-gate responses (`requireFeature` → 403) that also
  /// carry a plan-upgrade hint, vs. an ordinary permission 403.
  bool get isUpgradeRequired => statusCode == 403 && message.toLowerCase().contains('plan');

  @override
  String toString() => message;
}
