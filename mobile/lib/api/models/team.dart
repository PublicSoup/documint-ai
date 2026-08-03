/// Mirrors team shapes from /api/teams and /api/teams/[id].
class TeamMember {
  final String userId;
  final String role;
  final String? name;
  final String? email;
  final String? image;

  const TeamMember({required this.userId, required this.role, this.name, this.email, this.image});

  factory TeamMember.fromJson(Map<String, dynamic> json) {
    final user = json['user'] as Map<String, dynamic>?;
    return TeamMember(
      userId: json['userId'] as String? ?? '',
      role: json['role'] as String? ?? 'MEMBER',
      name: user?['name'] as String?,
      email: user?['email'] as String?,
      image: user?['image'] as String?,
    );
  }
}

class TeamInvite {
  final String id;
  final String email;
  final String role;

  const TeamInvite({required this.id, required this.email, required this.role});

  factory TeamInvite.fromJson(Map<String, dynamic> json) => TeamInvite(
        id: json['id'] as String? ?? '',
        email: json['email'] as String? ?? '',
        role: json['role'] as String? ?? 'MEMBER',
      );
}

class Team {
  final String id;
  final String name;
  final String? slug;
  final String? role; // current user's role (present in list response)
  final int memberCount;
  final List<TeamMember> members;
  final List<TeamInvite> invites;

  const Team({
    required this.id,
    required this.name,
    this.slug,
    this.role,
    this.memberCount = 0,
    this.members = const [],
    this.invites = const [],
  });

  factory Team.fromJson(Map<String, dynamic> json) => Team(
        id: json['id'] as String,
        name: json['name'] as String? ?? 'Team',
        slug: json['slug'] as String?,
        role: json['role'] as String?,
        memberCount: (json['memberCount'] as num?)?.toInt() ?? (json['members'] as List<dynamic>?)?.length ?? 0,
        members: (json['members'] as List<dynamic>? ?? const [])
            .map((m) => TeamMember.fromJson(m as Map<String, dynamic>))
            .toList(),
        invites: (json['invites'] as List<dynamic>? ?? const [])
            .map((i) => TeamInvite.fromJson(i as Map<String, dynamic>))
            .toList(),
      );
}
