import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { pageAlternates, pageMetadata } from "./page-metadata";

const BASE = "https://infraworldwide.example";

describe("pageAlternates", () => {
  const alternates = pageAlternates("ro", "/projects/ro-a1", BASE);

  it("makes the viewed locale canonical", () => {
    expect(alternates.canonical).toBe(`${BASE}/ro/projects/ro-a1`);
  });

  it("lists every configured locale, plus x-default", () => {
    // Straight from routing, so a third locale needs no edit here.
    expect(alternates.languages).toEqual({
      en: `${BASE}/en/projects/ro-a1`,
      ro: `${BASE}/ro/projects/ro-a1`,
      "x-default": `${BASE}/en/projects/ro-a1`,
    });
  });
});

describe("pageMetadata", () => {
  const meta = pageMetadata({
    locale: "ro",
    path: "/countries/ro",
    title: "România",
    description: "Autostrăzi și căi ferate.",
    siteName: "InfraWorldWide",
    baseUrl: BASE,
  });

  it("carries the page's own canonical and hreflang set", () => {
    expect(meta.alternates?.canonical).toBe(`${BASE}/ro/countries/ro`);
    expect(meta.alternates?.languages?.["x-default"]).toBe(
      `${BASE}/en/countries/ro`,
    );
  });

  it("keeps feed autodiscovery, which a bare alternates object would drop", () => {
    // A page that sets `alternates` replaces the layout's wholesale, RSS link
    // included, so it has to be restated here.
    expect(meta.alternates?.types).toEqual({
      "application/rss+xml": [
        { url: `${BASE}/ro/openings.xml`, title: "InfraWorldWide" },
      ],
    });
  });

  it("restates the openGraph block the layout would otherwise supply", () => {
    // openGraph is replaced, not merged, by the deepest segment that sets it.
    expect(meta.openGraph).toMatchObject({
      type: "website",
      siteName: "InfraWorldWide",
      locale: "ro",
      title: "România",
      description: "Autostrăzi și căi ferate.",
      url: `${BASE}/ro/countries/ro`,
    });
  });

  it("omits a title and description rather than emitting empty ones", () => {
    const bare = pageMetadata({
      locale: "en",
      path: "/",
      siteName: "InfraWorldWide",
      baseUrl: BASE,
    });
    expect(bare.title).toBeUndefined();
    expect(bare.description).toBeUndefined();
    // The layout's title.default still applies, so the page is not untitled.
    expect(bare.openGraph).not.toHaveProperty("title");
  });
});

/**
 * The AGENTS.md rule made executable: a page with its own metadata builds it
 * through `pageMetadata`, so it carries its own canonical and hreflang set.
 * Metadata merges shallowly, so a page returning a bare `{ title }` inherits
 * the layout's canonical, the site root, and both locale trees then claim
 * the same URL as duplicates. The map and cities index pages had slipped
 * through exactly this way. The embed page is noindex and exempt.
 */
describe("every indexable page builds its metadata through pageMetadata", () => {
  const appDir = resolve(__dirname, "../app/[lang]");

  function pageFiles(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return pageFiles(full);
      return entry.name === "page.tsx" ? [full] : [];
    });
  }

  // Forward slashes throughout, so the exemption reads the same on Windows.
  const pages = pageFiles(appDir).map((file) => ({
    file: file.split("\\").join("/"),
    source: readFileSync(file, "utf8"),
  }));

  const withMetadata = pages.filter(
    ({ file, source }) =>
      (source.includes("generateMetadata") ||
        source.includes("export const metadata")) &&
      !file.includes("/embed/"),
  );

  it("finds the pages it is meant to check", () => {
    expect(withMetadata.length).toBeGreaterThan(1);
  });

  it("leaves no page inheriting the layout's canonical", () => {
    const missing = withMetadata
      .filter(({ source }) => !source.includes("pageMetadata("))
      .map(({ file }) => file.slice(file.indexOf("/src/app/")));
    expect(missing).toEqual([]);
  });
});
