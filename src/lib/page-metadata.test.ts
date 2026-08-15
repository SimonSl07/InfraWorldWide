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
