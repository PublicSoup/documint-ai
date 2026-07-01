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
  // COOP/COEP for /code are set in middleware (src/proxy.ts) because the COEP
  // mode is browser-dependent (Safari needs require-corp, others credentialless).
  // Setting a static value here too would emit a conflicting duplicate header.
};

export default nextConfig;
