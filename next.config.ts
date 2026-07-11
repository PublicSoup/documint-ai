import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: __dirname,
  },
  serverExternalPackages: [],
  images: {
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "lh3.googleusercontent.com" },
      { protocol: "https", hostname: "www.google.com" },
    ],
  },
  async rewrites() {
    return [
      {
        source: "/proxy/github/:path*",
        destination: "https://api.github.com/:path*",
      },
    ];
  },
  // NOTE: security headers (HSTS, X-Frame-Options, X-Content-Type-Options,
  // Referrer-Policy, Permissions-Policy, COOP/COEP/CORP and a full CSP) are set
  // per-request in middleware (src/proxy.ts). Do not also set them here — that
  // would emit conflicting duplicate headers.
};

export default nextConfig;
