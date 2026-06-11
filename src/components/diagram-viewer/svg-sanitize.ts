const MAX_DIAGRAM_CHARS = 100_000;

export function sanitizeMermaidInput(input: string): string {
  return input
    .replace(/\u0000/g, "")
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .trim()
    .slice(0, MAX_DIAGRAM_CHARS);
}

function isSafeSvgUrl(rawValue: string): boolean {
  const value = rawValue.trim().toLowerCase();
  if (!value) return true;
  if (value.startsWith("#") || value.startsWith("/")) return true;
  if (value.startsWith("data:")) return false;
  return value.startsWith("http://") || value.startsWith("https://") || value.startsWith("mailto:") || value.startsWith("tel:");
}

export function sanitizeSvg(svg: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svg, "image/svg+xml");

  for (const tag of ["script", "foreignObject", "iframe", "object", "embed", "link"]) {
    doc.querySelectorAll(tag).forEach((node) => node.remove());
  }

  doc.querySelectorAll("*").forEach((element) => {
    for (const attr of [...element.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value;

      if (name.startsWith("on")) {
        element.removeAttribute(attr.name);
        continue;
      }

      if ((name === "href" || name === "xlink:href") && !isSafeSvgUrl(value)) {
        element.removeAttribute(attr.name);
      }
    }
  });

  return new XMLSerializer().serializeToString(doc);
}

export function decodeMermaidIdArg(raw: string): string {
  return raw.replace(/#quot;/g, '"');
}
