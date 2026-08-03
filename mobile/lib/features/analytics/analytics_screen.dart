import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../api/api_exception.dart';
import '../../api/models/analytics_docs.dart';
import '../../api/models/analytics_usage.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';

/// Feature-gated (403) analytics dashboards, rendered with hand-built stat
/// tiles + simple proportional bars (no charting dependency).
final _usageProvider = FutureProvider.autoDispose.family<UsageAnalytics, String>((ref, period) {
  return ref.watch(analyticsRepositoryProvider).getUsage(period: period);
});

final _docsProvider = FutureProvider.autoDispose<DocsAnalytics>((ref) {
  return ref.watch(analyticsRepositoryProvider).getDocs();
});

class AnalyticsScreen extends ConsumerStatefulWidget {
  const AnalyticsScreen({super.key});

  @override
  ConsumerState<AnalyticsScreen> createState() => _AnalyticsScreenState();
}

class _AnalyticsScreenState extends ConsumerState<AnalyticsScreen> {
  String _period = '7d';

  @override
  Widget build(BuildContext context) {
    final usageAsync = ref.watch(_usageProvider(_period));
    final docsAsync = ref.watch(_docsProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Analytics'),
        actions: [
          PopupMenuButton<String>(
            initialValue: _period,
            onSelected: (v) => setState(() => _period = v),
            itemBuilder: (context) => const [
              PopupMenuItem(value: '7d', child: Text('Last 7 days')),
              PopupMenuItem(value: '30d', child: Text('Last 30 days')),
              PopupMenuItem(value: '90d', child: Text('Last 90 days')),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Row(children: [Text(_period), const Icon(Icons.arrow_drop_down)]),
            ),
          ),
        ],
      ),
      body: usageAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => _errorOrUpgrade(context, e),
        data: (usage) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(_usageProvider(_period));
            ref.invalidate(_docsProvider);
            await ref.read(_usageProvider(_period).future);
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _StatGrid(tiles: [
                _Stat('API calls', usage.totalCalls.toString()),
                _Stat('Doc views', usage.totalViews.toString()),
                _Stat('Files created', usage.filesCreated.toString()),
                _Stat('Avg/day', usage.avgDailyCalls.toString()),
              ]),
              const SizedBox(height: 20),
              Text('Daily activity', style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              _BarRow(points: usage.chartData),
              const SizedBox(height: 20),
              docsAsync.when(
                loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
                error: (e, _) => const SizedBox.shrink(),
                data: (docs) => _DocsSection(docs: docs),
              ),
              if (usage.actionBreakdown.isNotEmpty) ...[
                const SizedBox(height: 20),
                Text('Top actions', style: Theme.of(context).textTheme.titleMedium),
                const SizedBox(height: 8),
                for (final a in usage.actionBreakdown.take(8))
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 4),
                    child: Row(
                      children: [
                        Expanded(child: Text(a.action, style: Theme.of(context).textTheme.bodySmall, overflow: TextOverflow.ellipsis)),
                        Text(a.count.toString(), style: const TextStyle(fontWeight: FontWeight.w600)),
                      ],
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _errorOrUpgrade(BuildContext context, Object e) {
    final upgrade = e is ApiException && e.isForbidden;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(upgrade ? Icons.lock_outline : Icons.error_outline, size: 40, color: upgrade ? AppColors.primary : AppColors.destructive),
            const SizedBox(height: 16),
            Text(
              e is ApiException ? e.message : 'Failed to load analytics.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium,
            ),
            if (upgrade) ...[
              const SizedBox(height: 8),
              Text('Upgrade your plan on the web to unlock analytics.', style: Theme.of(context).textTheme.bodySmall, textAlign: TextAlign.center),
            ],
          ],
        ),
      ),
    );
  }
}

class _DocsSection extends StatelessWidget {
  const _DocsSection({required this.docs});
  final DocsAnalytics docs;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Documentation coverage', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${docs.coveragePercentage}%', style: Theme.of(context).textTheme.titleLarge),
                    Text('${docs.coverageDocumented}/${docs.coverageTotal} documented', style: Theme.of(context).textTheme.bodySmall),
                  ],
                ),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(999),
                  child: LinearProgressIndicator(
                    value: (docs.coveragePercentage.clamp(0, 100)) / 100,
                    minHeight: 8,
                    backgroundColor: AppColors.secondary,
                  ),
                ),
              ],
            ),
          ),
        ),
        if (docs.topDocs.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text('Most viewed docs', style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 8),
          for (final d in docs.topDocs)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 4),
              child: Row(
                children: [
                  const Icon(Icons.description_outlined, size: 16, color: AppColors.mutedForeground),
                  const SizedBox(width: 8),
                  Expanded(child: Text(d.name, style: Theme.of(context).textTheme.bodySmall, overflow: TextOverflow.ellipsis)),
                  Text('${d.views} views', style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
        ],
      ],
    );
  }
}

class _Stat {
  final String label;
  final String value;
  _Stat(this.label, this.value);
}

class _StatGrid extends StatelessWidget {
  const _StatGrid({required this.tiles});
  final List<_Stat> tiles;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      childAspectRatio: 2.2,
      crossAxisSpacing: 8,
      mainAxisSpacing: 8,
      children: [
        for (final t in tiles)
          Card(
            margin: EdgeInsets.zero,
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(t.value, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 2),
                  Text(t.label, style: Theme.of(context).textTheme.bodySmall),
                ],
              ),
            ),
          ),
      ],
    );
  }
}

/// Dependency-free proportional bar chart of daily call counts.
class _BarRow extends StatelessWidget {
  const _BarRow({required this.points});
  final List<UsagePoint> points;

  @override
  Widget build(BuildContext context) {
    if (points.isEmpty) {
      return Text('No activity in this period.', style: Theme.of(context).textTheme.bodySmall);
    }
    final maxCalls = points.map((p) => p.calls).fold<int>(1, (a, b) => b > a ? b : a);

    return Card(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 8),
        child: SizedBox(
          height: 120,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final p in points)
                Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 1.5),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        Container(
                          height: (p.calls / maxCalls) * 96 + 2,
                          decoration: BoxDecoration(
                            color: AppColors.primary,
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
