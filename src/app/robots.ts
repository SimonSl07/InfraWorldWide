import type { MetadataRoute } from "next";
import { absoluteUrl, siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = siteUrl(process.env);

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // The feedback intake is a POST endpoint with nothing to index.
      disallow: "/api/",
    },
    sitemap: absoluteUrl(baseUrl, "/sitemap.xml"),
  };
}
