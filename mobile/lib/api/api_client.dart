import 'package:dio/dio.dart';

import '../auth/session_storage.dart';
import '../core/env.dart';
import 'api_exception.dart';
import 'models/mobile_session.dart';

/// Thin REST client — the mobile analogue of the web app's SWR-backed fetch
/// usage. Talks directly to the existing Next.js `/api/**` surface; auth is
/// a bearer token (src/lib/mobile-auth.ts on the backend) rather than a
/// browser session cookie.
///
/// Concurrent 401s are de-duped onto a single in-flight refresh call
/// (`_refreshing`) rather than racing multiple refresh-token rotations
/// against each other, mirroring the equivalent logic in the earlier
/// Expo/TS prototype of this client.
class ApiClient {
  ApiClient._internal()
      : dio = Dio(BaseOptions(
          baseUrl: Env.apiUrl,
          headers: {'Content-Type': 'application/json'},
          connectTimeout: const Duration(seconds: 20),
          receiveTimeout: const Duration(seconds: 90), // matches the sandbox route's maxDuration=60s + headroom
        )) {
    dio.interceptors.add(InterceptorsWrapper(onRequest: _onRequest, onError: _onError));
  }

  static final ApiClient instance = ApiClient._internal();

  final Dio dio;

  /// Set by AuthController so a terminal 401 (refresh also failed) can
  /// force a sign-out + redirect back to the login screen.
  void Function()? onUnauthorized;

  Future<String?>? _refreshing;

  Future<void> _onRequest(RequestOptions options, RequestInterceptorHandler handler) async {
    final skipAuth = options.extra['skipAuth'] == true;
    if (!skipAuth) {
      final session = await SessionStorage.instance.read();
      if (session != null) {
        options.headers['Authorization'] = 'Bearer ${session.accessToken}';
      }
    }
    handler.next(options);
  }

  Future<void> _onError(DioException err, ErrorInterceptorHandler handler) async {
    final response = err.response;
    final skipAuth = err.requestOptions.extra['skipAuth'] == true;

    if (response?.statusCode != 401 || skipAuth) {
      handler.next(_toApiError(err));
      return;
    }

    final newAccessToken = await _refreshAccessToken();
    if (newAccessToken == null) {
      await SessionStorage.instance.clear();
      onUnauthorized?.call();
      handler.next(_toApiError(err));
      return;
    }

    try {
      final retryOptions = err.requestOptions;
      retryOptions.headers['Authorization'] = 'Bearer $newAccessToken';
      final retryResponse = await dio.fetch(retryOptions);
      handler.resolve(retryResponse);
    } on DioException catch (retryErr) {
      handler.next(_toApiError(retryErr));
    }
  }

  Future<String?> _refreshAccessToken() {
    return _refreshing ??= () async {
      try {
        final session = await SessionStorage.instance.read();
        if (session == null) return null;

        final response = await dio.post(
          '/api/mobile/auth/refresh',
          data: {'refreshToken': session.refreshToken},
          options: Options(extra: {'skipAuth': true}),
        );

        final refreshed = MobileSession.fromJson(response.data as Map<String, dynamic>);
        await SessionStorage.instance.write(refreshed);
        return refreshed.accessToken;
      } catch (_) {
        return null;
      } finally {
        _refreshing = null;
      }
    }();
  }

  DioException _toApiError(DioException err) {
    final response = err.response;
    if (response == null) {
      return err.copyWith(
        error: ApiException(statusCode: 0, error: 'NetworkError', message: err.message ?? 'Network request failed'),
      );
    }

    return err.copyWith(
      error: ApiException.fromResponse(response.statusCode ?? 0, response.data),
    );
  }

  Options _options({bool skipAuth = false}) => Options(extra: {'skipAuth': skipAuth});

  Future<T> getJson<T>(String path, {Map<String, dynamic>? query, bool skipAuth = false}) async {
    final response = await dio.get(path, queryParameters: query, options: _options(skipAuth: skipAuth));
    return response.data as T;
  }

  Future<T> postJson<T>(String path, {dynamic body, bool skipAuth = false}) async {
    final response = await dio.post(path, data: body, options: _options(skipAuth: skipAuth));
    return response.data as T;
  }

  Future<T> putJson<T>(String path, {dynamic body, bool skipAuth = false}) async {
    final response = await dio.put(path, data: body, options: _options(skipAuth: skipAuth));
    return response.data as T;
  }
}

/// Unwraps the [ApiException] this client attaches to every [DioException]
/// so call sites can `catch (e)` on the domain type directly.
extension DioExceptionUnwrap on DioException {
  ApiException toApiException() => error is ApiException ? error as ApiException : ApiException(statusCode: 0, error: 'Error', message: message ?? 'Request failed');
}
