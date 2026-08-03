import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/data_providers.dart';
import '../../api/models/review.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';

const _statusColors = {
  'PENDING': AppColors.warning,
  'APPROVED': AppColors.success,
  'CHANGES_REQUESTED': AppColors.destructive,
};

class ReviewsScreen extends ConsumerWidget {
  const ReviewsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(reviewsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Reviews')),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Text(e is ApiException ? e.message : 'Failed to load reviews.', style: const TextStyle(color: AppColors.destructive)),
          ),
        ),
        data: (reviews) {
          if (reviews.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Text('No review requests.', style: Theme.of(context).textTheme.bodySmall),
              ),
            );
          }
          return RefreshIndicator(
            onRefresh: () => ref.refresh(reviewsProvider.future),
            child: ListView.separated(
              padding: const EdgeInsets.all(16),
              itemCount: reviews.length,
              separatorBuilder: (_, _) => const SizedBox(height: 8),
              itemBuilder: (context, index) => _ReviewCard(review: reviews[index]),
            ),
          );
        },
      ),
    );
  }
}

class _ReviewCard extends ConsumerWidget {
  const _ReviewCard({required this.review});
  final Review review;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final color = _statusColors[review.status] ?? AppColors.mutedForeground;
    final isPending = review.status == 'PENDING';

    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(review.fileName ?? 'Documentation', maxLines: 1, overflow: TextOverflow.ellipsis, style: Theme.of(context).textTheme.titleMedium)),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: color.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(999),
                    border: Border.all(color: color.withValues(alpha: 0.4)),
                  ),
                  child: Text(review.status.replaceAll('_', ' '), style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 6),
            Text(
              'From ${review.requesterName ?? 'someone'}${review.reviewerName != null ? ' · for ${review.reviewerName}' : ''}',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (review.comments != null && review.comments!.isNotEmpty) ...[
              const SizedBox(height: 8),
              Text(review.comments!, style: Theme.of(context).textTheme.bodyMedium),
            ],
            if (isPending) ...[
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: OutlinedButton(
                      onPressed: () => _act(context, ref, 'CHANGES_REQUESTED'),
                      style: OutlinedButton.styleFrom(foregroundColor: AppColors.destructive, side: const BorderSide(color: AppColors.destructive)),
                      child: const Text('Request changes'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  Expanded(
                    child: ElevatedButton(
                      onPressed: () => _act(context, ref, 'APPROVED'),
                      child: const Text('Approve'),
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }

  Future<void> _act(BuildContext context, WidgetRef ref, String status) async {
    final messenger = ScaffoldMessenger.of(context);
    final comment = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(status == 'APPROVED' ? 'Approve review' : 'Request changes'),
        content: TextField(controller: comment, maxLines: 3, decoration: const InputDecoration(labelText: 'Comment (optional)')),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Submit')),
        ],
      ),
    );
    if (confirmed != true) return;
    try {
      await ref.read(reviewsRepositoryProvider).updateReview(
            id: review.id,
            status: status,
            comments: comment.text.trim().isEmpty ? null : comment.text.trim(),
          );
      ref.invalidate(reviewsProvider);
      messenger.showSnackBar(const SnackBar(content: Text('Review updated.')));
    } catch (e) {
      messenger.showSnackBar(SnackBar(content: Text(e is ApiException ? e.message : 'Failed to update review.')));
    }
  }
}
