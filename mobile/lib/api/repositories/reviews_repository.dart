import '../api_client.dart';
import '../models/review.dart';

/// Talks to /api/reviews and /api/reviews/[id].
class ReviewsRepository {
  ReviewsRepository(this._client);
  final ApiClient _client;

  Future<List<Review>> listReviews() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/reviews');
    final raw = json['reviews'] as List<dynamic>? ?? const [];
    return raw.map((r) => Review.fromJson(r as Map<String, dynamic>)).toList();
  }

  /// status: "APPROVED" | "CHANGES_REQUESTED".
  Future<void> updateReview({required String id, required String status, String? comments}) async {
    await _client.dio.put('/api/reviews/$id', data: {
      'status': status,
      'comments': ?comments,
    });
  }
}
