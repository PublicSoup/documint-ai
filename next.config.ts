import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mark tree-sitter as external to prevent bundling native modules
  serverExternalPackages: [
    "tree-sitter",
    "tree-sitter-python",
    "tree-sitter-javascript",
    "tree-sitter-typescript",
    "tree-sitter-go",
    "tree-sitter-rust",
    "tree-sitter-java",
    "tree-sitter-c-sharp",
  ],
};

export default nextConfig;
