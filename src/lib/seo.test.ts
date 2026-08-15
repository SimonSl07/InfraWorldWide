import { describe, it, expect } from "vitest";
import { absoluteUrl, buildAlternates, localePath, siteUrl } from "./seo";

const BASE = "https://infraworldwide.example";
const LOCALES = ["en", "ro"] as const;

describe("localePath", () => {
  it("prefixes a path with its locale", () => {
    expect(localePath("en", "/projects")).toBe("/en/projects");
    expect(localePath("ro", "/projects/ro-a1")).toBe("/ro/projects/ro-a1");
  });

  it("maps the site root to the bare locale", () => {
    expect(localePath("en", "")).toBe("/en");
    expect(localePath("en", "/")).toBe("/en");
  });

  it("tolerates a missing leading slash", () => {
    expect(localePath("ro", "countries")).toBe("/ro/countries");
  });
});

describe("absoluteUrl", () => {
  it("joins base and path without doubling the slash", () => {
    expect(absoluteUrl(BASE, "/en/map")).toBe(`${BASE}/en/map`);
    expect(absoluteUrl(`${BASE}/`, "/en/map")).toBe(`${BASE}/en/map`);
  });
});

describe("buildAlternates", () => {
  const options = {
    baseUrl: BASE,
    path: "/projects/ro-a1",
    locale: "ro",
    locales: LOCALES,
    defaultLocale: "en",
  };

  it("makes the current locale canonical", () => {
    expect(buildAlternates(options).canonical).toBe(
      `${BASE}/ro/projects/ro-a1`,
    );
  });

  it("lists every locale as an alternate", () => {
    expect(buildAlternates(options).languages).toMatchObject({
      en: `${BASE}/en/projects/ro-a1`,
      ro: `${BASE}/ro/projects/ro-a1`,
    });
  });

  it("points x-default at the default locale", () => {
    // Without it a search engine has to guess which of the two to show a
    // reader whose language matches neither.
    expect(buildAlternates(options).languages["x-default"]).toBe(
      `${BASE}/en/projects/ro-a1`,
    );
  });

  it("handles the site root", () => {
    const alt = buildAlternates({ ...options, path: "/" });
    expect(alt.canonical).toBe(`${BASE}/ro`);
    expect(alt.languages.en).toBe(`${BASE}/en`);
  });
});

describe("siteUrl", () => {
  it("prefers an explicit site URL", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.org" })).toBe(
      "https://example.org",
    );
  });

  it("strips a trailing slash so joins stay predictable", () => {
    expect(siteUrl({ NEXT_PUBLIC_SITE_URL: "https://example.org/" })).toBe(
      "https://example.org",
    );
  });

  it("derives an origin from the Vercel deployment URL", () => {
    expect(siteUrl({ VERCEL_PROJECT_PRODUCTION_URL: "infra.vercel.app" })).toBe(
      "https://infra.vercel.app",
    );
  });

  it("falls back to localhost so a local build still produces valid URLs", () => {
    expect(siteUrl({})).toBe("http://localhost:3000");
  });
});
