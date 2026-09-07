import { countryName } from "./country-names";
import { absoluteUrl, localePath } from "./seo";
import { EXTERNAL_LINKS } from "./links";

/**
 * schema.org JSON-LD.
 *
 * This site is literally a cited dataset with a licence and a temporal range,
 * which is exactly what the Dataset type describes, so declaring it makes the
 * data discoverable as data rather than only as pages.
 *
 * Pure builders, so the shapes can be asserted in tests instead of inspected
 * in a rendered page.
 */

export type JsonLd = Record<string, unknown>;

export function datasetJsonLd(options: {
  baseUrl: string;
  locale: string;
  name: string;
  description: string;
  countries: string[];
  firstYear: number;
  lastYear: number;
}): JsonLd {
  const { baseUrl, locale, name, description, countries, firstYear, lastYear } =
    options;

  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    name,
    description,
    url: absoluteUrl(baseUrl, localePath(locale, "/")),
    // Two, and both have to travel: the geometry is OSM-derived and
    // share-alike, everything curated here is CC BY. See data/LICENSE.
    license: [EXTERNAL_LINKS.odbl, EXTERNAL_LINKS.ccBy],
    isAccessibleForFree: true,
    creator: { "@type": "Person", "@id": EXTERNAL_LINKS.github },
    temporalCoverage: `${firstYear}/${lastYear}`,
    spatialCoverage: countries.map((code) => ({
      "@type": "Country",
      name: countryName(code, "en"),
    })),
    keywords: [
      "infrastructure",
      "motorway",
      "railway",
      "bridge",
      "tunnel",
      "construction cost",
      "public procurement",
    ],
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: absoluteUrl(baseUrl, "/data/projects.json"),
      },
      {
        "@type": "DataDownload",
        encodingFormat: "application/geo+json",
        contentUrl: absoluteUrl(baseUrl, "/data/geo/manifest.json"),
      },
    ],
  };
}

export function websiteJsonLd(options: {
  baseUrl: string;
  locale: string;
  name: string;
}): JsonLd {
  const { baseUrl, locale, name } = options;
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name,
    url: absoluteUrl(baseUrl, localePath(locale, "/")),
    inLanguage: locale,
  };
}

export function breadcrumbList(options: {
  baseUrl: string;
  locale: string;
  /** Ordered from the shallowest crumb to the current page. */
  items: { name: string; path: string }[];
}): JsonLd {
  const { baseUrl, locale, items } = options;
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(baseUrl, localePath(locale, item.path)),
    })),
  };
}

/** Serialize for a <script type="application/ld+json"> tag. */
export function jsonLdScript(data: JsonLd | JsonLd[]): string {
  // "<" is escaped so a stray value can never close the script element.
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
