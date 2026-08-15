import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getCityKeys, getCountries, getProjects } from "@/lib/data";
import { absoluteUrl, buildAlternates, localePath, siteUrl } from "@/lib/seo";
import { loadContractorProfiles } from "./[lang]/contractors/profiles";

/**
 * Every statically generated route, in both locales, with its hreflang set.
 *
 * Driven by the same accessors `generateStaticParams` uses, so a new project
 * or country appears here the moment it appears in the data. Nothing else
 * needs updating.
 */

/** Locale-independent paths, roughly in order of importance. */
function paths(): { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] {
  const staticPaths = [
    { path: "/", priority: 1, changeFrequency: "weekly" as const },
    { path: "/map", priority: 0.9, changeFrequency: "weekly" as const },
    { path: "/projects", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/countries", priority: 0.8, changeFrequency: "weekly" as const },
    { path: "/cities", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/rankings", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/contractors", priority: 0.7, changeFrequency: "weekly" as const },
    { path: "/data", priority: 0.5, changeFrequency: "monthly" as const },
    { path: "/about", priority: 0.5, changeFrequency: "monthly" as const },
  ];

  return [
    ...staticPaths,
    ...loadContractorProfiles().map((profile) => ({
      path: `/contractors/${profile.id}`,
      priority: 0.5,
      changeFrequency: "monthly" as const,
    })),
    ...getCountries().map((code) => ({
      path: `/countries/${code}`,
      priority: 0.7,
      changeFrequency: "weekly" as const,
    })),
    ...getCityKeys().map((key) => ({
      path: `/cities/${key}`,
      priority: 0.6,
      changeFrequency: "weekly" as const,
    })),
    ...getProjects().map((project) => ({
      path: `/projects/${project.id}`,
      priority: 0.6,
      changeFrequency: "monthly" as const,
    })),
  ];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = siteUrl(process.env);

  return paths().flatMap(({ path, priority, changeFrequency }) => {
    const { languages } = buildAlternates({
      baseUrl,
      path,
      locale: routing.defaultLocale,
      locales: routing.locales,
      defaultLocale: routing.defaultLocale,
    });

    return routing.locales.map((locale) => ({
      url: absoluteUrl(baseUrl, localePath(locale, path)),
      changeFrequency,
      priority,
      alternates: { languages },
    }));
  });
}
