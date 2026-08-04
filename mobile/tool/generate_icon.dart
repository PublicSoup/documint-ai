// Generates the DocuMint AI app icon artwork.
//
// Run:  dart run tool/generate_icon.dart
// Then: dart run flutter_launcher_icons && dart run flutter_native_splash:create
//
// Two 1024x1024 PNGs are written to assets/icon/:
//   icon.png            — full-bleed brand gradient + glyph (iOS / legacy Android)
//   icon_foreground.png — glyph only on transparent (Android adaptive layer,
//                         also reused as the splash image)
//
// Design: the brand's purple gradient (#7C3AED -> #C084FC, matching the web
// app's .text-gradient-primary) behind a white document glyph with a folded
// corner and text lines, plus a green check badge — "documentation, verified".
// Drawn programmatically because this environment has no rasterizer
// (ImageMagick/PIL/rsvg are all unavailable).

import 'dart:io';
import 'dart:math' as math;

import 'package:image/image.dart' as img;

const int size = 1024;

// Brand palette (mobile/lib/theme/app_theme.dart + src/app/globals.css).
final gradientTop = img.ColorRgb8(0x7C, 0x3A, 0xED);
final gradientBottom = img.ColorRgb8(0xC0, 0x84, 0xFC);
final white = img.ColorRgba8(0xFF, 0xFF, 0xFF, 0xFF);
final pagePurple = img.ColorRgba8(0x7C, 0x3A, 0xED, 0xFF);
final checkGreen = img.ColorRgba8(0x22, 0xC5, 0x5E, 0xFF);

void main() {
  final dir = Directory('assets/icon');
  dir.createSync(recursive: true);

  final icon = img.Image(width: size, height: size, numChannels: 4);
  _fillGradient(icon);
  _drawGlyph(icon);
  File('${dir.path}/icon.png').writeAsBytesSync(img.encodePng(icon));

  // Adaptive/splash foreground: same glyph, transparent background. Android
  // masks ~33% off each edge of an adaptive icon, so the glyph is drawn at
  // 62% scale to stay inside the safe zone.
  final foreground = img.Image(width: size, height: size, numChannels: 4);
  img.fill(foreground, color: img.ColorRgba8(0, 0, 0, 0));
  _drawGlyph(foreground, scale: 0.72);
  File('${dir.path}/icon_foreground.png').writeAsBytesSync(img.encodePng(foreground));

  stdout.writeln('Wrote assets/icon/icon.png and assets/icon/icon_foreground.png');
}

/// Vertical brand gradient with a soft radial highlight, echoing the web
/// app's purple radial-gradient body background.
void _fillGradient(img.Image image) {
  for (var y = 0; y < size; y++) {
    final t = y / (size - 1);
    final r = _lerp(gradientTop.r, gradientBottom.r, t);
    final g = _lerp(gradientTop.g, gradientBottom.g, t);
    final b = _lerp(gradientTop.b, gradientBottom.b, t);

    for (var x = 0; x < size; x++) {
      // Highlight centred up-left, falling off to nothing by the far corner.
      final dx = (x - size * 0.32) / size;
      final dy = (y - size * 0.28) / size;
      final glow = math.max(0.0, 1.0 - math.sqrt(dx * dx + dy * dy) * 1.9) * 26;

      image.setPixelRgba(
        x,
        y,
        (r + glow).clamp(0, 255).toInt(),
        (g + glow).clamp(0, 255).toInt(),
        (b + glow).clamp(0, 255).toInt(),
        255,
      );
    }
  }
}

/// White document with a folded corner, purple text lines, and a green
/// verified badge on the lower-right.
void _drawGlyph(img.Image image, {double scale = 1.0}) {
  // The badge breaks out past the page's right edge, so nudge the whole
  // glyph left to keep the composition optically centred.
  final cx = size / 2 - 26 * scale;
  final cy = size / 2;

  final pageW = 470.0 * scale;
  final pageH = 590.0 * scale;
  final left = cx - pageW / 2;
  final top = cy - pageH / 2;
  final radius = 46.0 * scale;
  final fold = 150.0 * scale;

  // Page body (rounded rect with the top-right corner cut for the fold).
  _fillRoundedRect(image, left, top, pageW, pageH, radius, white, cutTopRight: fold);

  // Folded corner: a triangle in a lighter purple so it reads as the back
  // of the page rather than a hole.
  final foldTint = img.ColorRgba8(0xE9, 0xD5, 0xFF, 0xFF);
  _fillTriangle(
    image,
    left + pageW - fold, top,
    left + pageW, top + fold,
    left + pageW - fold, top + fold,
    foldTint,
  );

  // Text lines. The last is short, the way a paragraph actually ends.
  final lineX = left + 62 * scale;
  final lineH = 30.0 * scale;
  final lineGap = 62.0 * scale;
  final lineR = lineH / 2;
  final widths = [
    pageW - 200 * scale, // shorter: clears the fold
    pageW - 124 * scale,
    pageW - 124 * scale,
    pageW - 210 * scale,
  ];
  var lineY = top + 214 * scale;
  for (final w in widths) {
    _fillRoundedRect(image, lineX, lineY, w, lineH, lineR, pagePurple);
    lineY += lineGap;
  }

  // Verified badge, overlapping the page's lower-right corner.
  final badgeR = 106.0 * scale;
  final badgeCx = left + pageW - 26 * scale;
  final badgeCy = top + pageH - 34 * scale;
  _fillCircle(image, badgeCx, badgeCy, badgeR + 17 * scale, white); // ring
  _fillCircle(image, badgeCx, badgeCy, badgeR, checkGreen);
  _drawCheck(image, badgeCx, badgeCy, badgeR, white);
}

/// Anti-aliased rounded rectangle. [cutTopRight] bevels the top-right corner
/// (used for the page fold).
void _fillRoundedRect(
  img.Image image,
  double x,
  double y,
  double w,
  double h,
  double r,
  img.Color color, {
  double cutTopRight = 0,
}) {
  final x0 = (x - 1).floor().clamp(0, size - 1);
  final x1 = (x + w + 1).ceil().clamp(0, size - 1);
  final y0 = (y - 1).floor().clamp(0, size - 1);
  final y1 = (y + h + 1).ceil().clamp(0, size - 1);

  for (var py = y0; py <= y1; py++) {
    for (var px = x0; px <= x1; px++) {
      final sx = px + 0.5;
      final sy = py + 0.5;

      var coverage = _roundedRectCoverage(sx, sy, x, y, w, h, r);
      if (coverage <= 0) continue;

      if (cutTopRight > 0) {
        // Inside the top-right corner box, the fold's hypotenuse runs from
        // (x+w-cut, y) to (x+w, y+cut). In local coords u=across, v=down,
        // the removed corner is u > v; d is the distance past that diagonal.
        final u = sx - (x + w - cutTopRight);
        final v = sy - y;
        final d = u - v;
        if (d > 0) coverage *= math.max(0.0, 1.0 - d);
        if (coverage <= 0) continue;
      }

      _blend(image, px, py, color, coverage);
    }
  }
}

/// Signed-distance coverage for a rounded rect, giving ~1px anti-aliasing.
double _roundedRectCoverage(double sx, double sy, double x, double y, double w, double h, double r) {
  final halfW = w / 2;
  final halfH = h / 2;
  final dx = (sx - (x + halfW)).abs() - (halfW - r);
  final dy = (sy - (y + halfH)).abs() - (halfH - r);

  final double distance;
  if (dx <= 0 && dy <= 0) {
    distance = math.max(dx, dy);
  } else {
    final ox = math.max(dx, 0.0);
    final oy = math.max(dy, 0.0);
    distance = math.sqrt(ox * ox + oy * oy) - r;
  }
  return (0.5 - distance).clamp(0.0, 1.0);
}

void _fillCircle(img.Image image, double cx, double cy, double r, img.Color color) {
  final x0 = (cx - r - 1).floor().clamp(0, size - 1);
  final x1 = (cx + r + 1).ceil().clamp(0, size - 1);
  final y0 = (cy - r - 1).floor().clamp(0, size - 1);
  final y1 = (cy + r + 1).ceil().clamp(0, size - 1);

  for (var py = y0; py <= y1; py++) {
    for (var px = x0; px <= x1; px++) {
      final dx = px + 0.5 - cx;
      final dy = py + 0.5 - cy;
      final coverage = (0.5 - (math.sqrt(dx * dx + dy * dy) - r)).clamp(0.0, 1.0);
      if (coverage > 0) _blend(image, px, py, color, coverage);
    }
  }
}

void _fillTriangle(
  img.Image image,
  double ax, double ay,
  double bx, double by,
  double cx, double cy,
  img.Color color,
) {
  final x0 = [ax, bx, cx].reduce(math.min).floor().clamp(0, size - 1);
  final x1 = [ax, bx, cx].reduce(math.max).ceil().clamp(0, size - 1);
  final y0 = [ay, by, cy].reduce(math.min).floor().clamp(0, size - 1);
  final y1 = [ay, by, cy].reduce(math.max).ceil().clamp(0, size - 1);

  double edge(double x, double y, double x0e, double y0e, double x1e, double y1e) =>
      (x - x0e) * (y1e - y0e) - (y - y0e) * (x1e - x0e);

  for (var py = y0; py <= y1; py++) {
    for (var px = x0; px <= x1; px++) {
      final sx = px + 0.5;
      final sy = py + 0.5;
      final e0 = edge(sx, sy, ax, ay, bx, by);
      final e1 = edge(sx, sy, bx, by, cx, cy);
      final e2 = edge(sx, sy, cx, cy, ax, ay);
      final inside = (e0 >= 0 && e1 >= 0 && e2 >= 0) || (e0 <= 0 && e1 <= 0 && e2 <= 0);
      if (inside) _blend(image, px, py, color, 1.0);
    }
  }
}

/// The checkmark inside the badge, drawn as two thick strokes.
void _drawCheck(img.Image image, double cx, double cy, double r, img.Color color) {
  final thickness = r * 0.30;
  _thickLine(image, cx - r * 0.46, cy + r * 0.02, cx - r * 0.12, cy + r * 0.38, thickness, color);
  _thickLine(image, cx - r * 0.12, cy + r * 0.38, cx + r * 0.50, cy - r * 0.34, thickness, color);
}

/// Round-capped line via per-pixel distance to the segment.
void _thickLine(img.Image image, double x1, double y1, double x2, double y2, double thickness, img.Color color) {
  final half = thickness / 2;
  final minX = (math.min(x1, x2) - half - 1).floor().clamp(0, size - 1);
  final maxX = (math.max(x1, x2) + half + 1).ceil().clamp(0, size - 1);
  final minY = (math.min(y1, y2) - half - 1).floor().clamp(0, size - 1);
  final maxY = (math.max(y1, y2) + half + 1).ceil().clamp(0, size - 1);

  final dx = x2 - x1;
  final dy = y2 - y1;
  final lengthSq = dx * dx + dy * dy;

  for (var py = minY; py <= maxY; py++) {
    for (var px = minX; px <= maxX; px++) {
      final sx = px + 0.5;
      final sy = py + 0.5;
      var t = lengthSq == 0 ? 0.0 : ((sx - x1) * dx + (sy - y1) * dy) / lengthSq;
      t = t.clamp(0.0, 1.0);
      final projX = x1 + t * dx;
      final projY = y1 + t * dy;
      final dist = math.sqrt((sx - projX) * (sx - projX) + (sy - projY) * (sy - projY));
      final coverage = (0.5 - (dist - half)).clamp(0.0, 1.0);
      if (coverage > 0) _blend(image, px, py, color, coverage);
    }
  }
}

/// Source-over alpha blend of [color] at [coverage] onto the pixel.
void _blend(img.Image image, int x, int y, img.Color color, double coverage) {
  final srcA = (color.a / 255) * coverage;
  if (srcA <= 0) return;

  final dst = image.getPixel(x, y);
  final dstA = dst.a / 255;
  final outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) {
    image.setPixelRgba(x, y, 0, 0, 0, 0);
    return;
  }

  double mix(num src, num dstC) => (src * srcA + dstC * dstA * (1 - srcA)) / outA;

  image.setPixelRgba(
    x,
    y,
    mix(color.r, dst.r).round().clamp(0, 255),
    mix(color.g, dst.g).round().clamp(0, 255),
    mix(color.b, dst.b).round().clamp(0, 255),
    (outA * 255).round().clamp(0, 255),
  );
}

double _lerp(num a, num b, double t) => a + (b - a) * t;
