import type { MetadataRoute } from "next";

const BASE_URL = "https://documintai.dev";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/docs", "/security", "/contact", "/auth/register"],
      disallow: ["/dashboard", "/api", "/admin", "/checkout/success"],
    },
    sitemap: `${BASE_URL}/sitemap.xml`,
    host: BASE_URL,
  };
}
