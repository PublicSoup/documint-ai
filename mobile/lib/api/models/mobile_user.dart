/// Mirrors `MobileSessionUser` in src/lib/mobile-auth.ts.
class MobileUser {
  final String id;
  final String? email;
  final String? name;
  final String? image;
  final String role;

  const MobileUser({
    required this.id,
    required this.email,
    required this.name,
    required this.image,
    required this.role,
  });

  factory MobileUser.fromJson(Map<String, dynamic> json) => MobileUser(
        id: json['id'] as String,
        email: json['email'] as String?,
        name: json['name'] as String?,
        image: json['image'] as String?,
        role: json['role'] as String? ?? 'USER',
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        'name': name,
        'image': image,
        'role': role,
      };
}
