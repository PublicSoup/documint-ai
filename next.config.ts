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
  async headers() {
    return [
      {
        // Only apply COEP/COOP to the /code route where WebContainer needs SharedArrayBuffer
        source: "/code/:path*",
        headers: [
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "credentialless",
          },
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
