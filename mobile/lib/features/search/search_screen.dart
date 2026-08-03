import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../api/api_exception.dart';
import '../../api/models/search_result.dart';
import '../../api/providers.dart';
import '../../theme/app_theme.dart';

class SearchScreen extends ConsumerStatefulWidget {
  const SearchScreen({super.key});

  @override
  ConsumerState<SearchScreen> createState() => _SearchScreenState();
}

class _SearchScreenState extends ConsumerState<SearchScreen> {
  final _controller = TextEditingController();
  Timer? _debounce;
  List<SearchResult> _results = [];
  bool _loading = false;
  String? _error;
  bool _searched = false;

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    super.dispose();
  }

  void _onChanged(String value) {
    _debounce?.cancel();
    if (value.trim().length < 2) {
      setState(() { _results = []; _searched = false; _error = null; });
      return;
    }
    _debounce = Timer(const Duration(milliseconds: 350), () => _run(value.trim()));
  }

  Future<void> _run(String query) async {
    setState(() { _loading = true; _error = null; });
    try {
      final results = await ref.read(searchRepositoryProvider).search(query);
      if (mounted) setState(() { _results = results; _loading = false; _searched = true; });
    } catch (e) {
      if (mounted) setState(() { _error = e is ApiException ? e.message : 'Search failed.'; _loading = false; _searched = true; });
    }
  }

  void _open(SearchResult result) {
    // File and doc results map to the existing file detail screen.
    if (result.type == 'file' || result.type == 'code' || result.type == 'doc') {
      context.push('/dashboard/${result.id}');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: TextField(
          controller: _controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: 'Search files, code, docs…', border: InputBorder.none),
          onChanged: _onChanged,
        ),
      ),
      body: _buildBody(),
    );
  }

  Widget _buildBody() {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(child: Padding(padding: const EdgeInsets.all(32), child: Text(_error!, style: const TextStyle(color: AppColors.destructive))));
    }
    if (!_searched) {
      return Center(child: Text('Type at least 2 characters to search.', style: Theme.of(context).textTheme.bodySmall));
    }
    if (_results.isEmpty) {
      return Center(child: Text('No results.', style: Theme.of(context).textTheme.bodySmall));
    }
    return ListView.separated(
      padding: const EdgeInsets.all(8),
      itemCount: _results.length,
      separatorBuilder: (_, _) => const Divider(height: 1),
      itemBuilder: (context, index) {
        final r = _results[index];
        return ListTile(
          leading: Icon(_iconFor(r.type), color: AppColors.mutedForeground),
          title: Text(r.title, maxLines: 1, overflow: TextOverflow.ellipsis),
          subtitle: Text(r.snippet ?? r.subtitle, maxLines: 2, overflow: TextOverflow.ellipsis),
          onTap: () => _open(r),
        );
      },
    );
  }

  IconData _iconFor(String type) {
    switch (type) {
      case 'doc':
        return Icons.description_outlined;
      case 'code':
        return Icons.code;
      default:
        return Icons.insert_drive_file_outlined;
    }
  }
}
