import '../api_client.dart';
import '../models/team.dart';

/// Talks to /api/teams, /api/teams/create, /api/teams/[id], /api/teams/invite.
class TeamsRepository {
  TeamsRepository(this._client);
  final ApiClient _client;

  Future<List<Team>> listTeams() async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/teams');
    final raw = json['teams'] as List<dynamic>? ?? const [];
    return raw.map((t) => Team.fromJson(t as Map<String, dynamic>)).toList();
  }

  Future<Team> createTeam(String name) async {
    final json = await _client.postJson<Map<String, dynamic>>('/api/teams/create', body: {'name': name});
    return Team.fromJson(json['team'] as Map<String, dynamic>);
  }

  Future<Team> getTeam(String teamId) async {
    final json = await _client.getJson<Map<String, dynamic>>('/api/teams/$teamId');
    return Team.fromJson(json['team'] as Map<String, dynamic>);
  }

  Future<void> invite({required String teamId, required String email, required String role}) async {
    await _client.postJson<Map<String, dynamic>>('/api/teams/invite', body: {
      'teamId': teamId,
      'email': email,
      'role': role,
    });
  }
}
