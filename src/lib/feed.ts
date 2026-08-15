import type { Opening } from "./timeline";
import type { LocalizedString } from "./schema";
import { absoluteUrl, localePath } from "./seo";

/**
 * RSS of the openings timeline.
 *
 * The dataset already knows exactly when each section opened, so a returning
 * reader can follow that rather than checking the site. Hand-built rather
 * than pulled from a library: it is one channel with a fixed shape, and the
 * escaping is the only part worth testing.
 */

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Partial ISO date to an RFC 822 timestamp, widening to the first day. */
export function rfc822(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(
    Date.UTC(year, (month ?? 1) - 1, day ?? 1),
  ).toUTCString();
}

function localized(value: LocalizedString, locale: string): string {
  return locale === "ro" && value.ro ? value.ro : value.en;
}

export function buildOpeningsFeed(options: {
  baseUrl: string;
  locale: string;
  title: string;
  description: string;
  openings: Opening[];
}): string {
  const { baseUrl, locale, title, description, openings } = options;
  const channelUrl = absoluteUrl(baseUrl, localePath(locale, "/projects"));
  const feedUrl = absoluteUrl(baseUrl, localePath(locale, "/openings.xml"));

  const items = openings.map((opening) => {
    const projectName = localized(opening.projectName, locale);
    const lotName = localized(opening.lotName, locale);
    const link = absoluteUrl(
      baseUrl,
      localePath(locale, `/projects/${opening.projectId}`),
    );

    return [
      "    <item>",
      `      <title>${escapeXml(`${projectName}: ${lotName}`)}</title>`,
      `      <link>${escapeXml(link)}</link>`,
      // Not a permalink: a lot has no page of its own, and the id is stable
      // while the URL and the title are not.
      `      <guid isPermaLink="false">${escapeXml(`${opening.projectId}/${opening.lotId}`)}</guid>`,
      `      <pubDate>${rfc822(opening.date)}</pubDate>`,
      `      <category>${escapeXml(opening.category)}</category>`,
      `      <description>${escapeXml(`${opening.lengthKm} km, ${opening.country.toUpperCase()}`)}</description>`,
      "    </item>",
    ].join("\n");
  });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(channelUrl)}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    `    <language>${escapeXml(locale)}</language>`,
    `    <atom:link href="${escapeXml(feedUrl)}" rel="self" type="application/rss+xml"/>`,
    ...items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
