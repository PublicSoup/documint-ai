/// Mirrors an entry from GET /api/reviews (the backend model is
/// ReviewRequest). fileId/fileName are nested under documentation.file.
class Review {
  final String id;
  final String status; // PENDING | APPROVED | CHANGES_REQUESTED
  final String? comments;
  final String createdAt;
  final String? fileName;
  final String? requesterName;
  final String? reviewerName;

  const Review({
    required this.id,
    required this.status,
    required this.comments,
    required this.createdAt,
    required this.fileName,
    required this.requesterName,
    required this.reviewerName,
  });

  factory Review.fromJson(Map<String, dynamic> json) {
    final doc = json['documentation'] as Map<String, dynamic>?;
    final file = doc?['file'] as Map<String, dynamic>?;
    final requester = json['requester'] as Map<String, dynamic>?;
    final reviewer = json['reviewer'] as Map<String, dynamic>?;
    return Review(
      id: json['id'] as String,
      status: json['status'] as String? ?? 'PENDING',
      comments: json['comments'] as String?,
      createdAt: json['createdAt'] as String? ?? '',
      fileName: file?['name'] as String?,
      requesterName: requester?['name'] as String?,
      reviewerName: reviewer?['name'] as String?,
    );
  }
}
