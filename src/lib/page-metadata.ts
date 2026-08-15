import type { Metadata } from "next";
import { routing } from "@/i18n/routing";
import {
  absoluteUrl,
  buildAlternates,
  localePath,
  siteUrl,
  type Alternates,
} from "./seo";

/**
 * Per-page canonical, hreflang and Open Graph.
 *
 * The root layout only describes "/", and metadata is merged shallowly: a
 * page that says nothing inherits the layout's canonical, so every page in
 * both locale trees claimed to be the site root. A page that does set
 * `alternates` or `openGraph` replaces the layout's copy outright, which is
 * why the feed link and the site name are restated here rather than left to
 * be inherited.
 */

/** The alternates for one locale-independent path, e.g. "/projects/ro-a1". */
export function pageAlternates(
  locale: string,
  path: string,
  baseUrl = siteUrl(process.env),
): Alternates {
  return buildAlternates({
    baseUrl,
    path,
    locale,
    locales: routing.locales,
    defaultLocale: routing.defaultLocale,
  });
}

export interface PageMetadataOptions {
  locale: string;
  /** Locale-independent path, e.g. "/countries/ro". */
  path: string;
  /** Omit to keep the layout's default title. */
  title?: string;
  description?: string;
  /** og:site_name, which the layout's openGraph block cannot pass down. */
  siteName: string;
  baseUrl?: string;
}

export function pageMetadata({
  locale,
  path,
  title,
  description,
  siteName,
  baseUrl = siteUrl(process.env),
}: PageMetadataOptions): Metadata {
  const alternates = pageAlternates(locale, path, baseUrl);

  return {
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    alternates: {
      ...alternates,
      types: {
        "application/rss+xml": [
          {
            url: absoluteUrl(baseUrl, localePath(locale, "/openings.xml")),
            title: siteName,
          },
        ],
      },
    },
    openGraph: {
      type: "website",
      siteName,
      locale,
      url: alternates.canonical,
      ...(title !== undefined ? { title } : {}),
      ...(description !== undefined ? { description } : {}),
    },
  };
}
