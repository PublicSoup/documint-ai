import 'package:flutter/material.dart';

import '../../widgets/coming_soon.dart';

class AnalyticsScreen extends StatelessWidget {
  const AnalyticsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Analytics')),
      body: const ComingSoon(
        title: 'Analytics',
        description: 'Usage and documentation analytics dashboards are landing in the next update.',
        icon: Icons.bar_chart_outlined,
      ),
    );
  }
}
