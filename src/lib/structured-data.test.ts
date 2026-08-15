import { describe, it, expect } from "vitest";
import { breadcrumbList, datasetJsonLd, websiteJsonLd } from "./structured-data";

const BASE = "https://infraworldwide.example";

describe("datasetJsonLd", () => {
  const dataset = datasetJsonLd({
    baseUrl: BASE,
    locale: "en",
    name: "InfraWorldWide",
    description: "The world's infrastructure, mapped through time",
    countries: ["ro", "bg", "rs"],
    firstYear: 1967,
    lastYear: 2030,
  });

  it("declares itself a Dataset", () => {
    expect(dataset["@context"]).toBe("https://schema.org");
    expect(dataset["@type"]).toBe("Dataset");
  });

  it("states the licence, because the geometry is share-alike", () => {
    // ODbL is an obligation, not a nicety: it has to travel with the data.
    expect(String(dataset.license)).toContain("odbl");
  });

  it("covers the years the data spans", () => {
    expect(dataset.temporalCoverage).toBe("1967/2030");
  });

  it("names the countries as spatial coverage", () => {
    const spatial = dataset.spatialCoverage as { name: string }[];
    expect(spatial.map((s) => s.name)).toEqual(["Romania", "Bulgaria", "Serbia"]);
  });

  it("points at the machine-readable artifacts", () => {
    const distributions = dataset.distribution as { contentUrl: string }[];
    expect(distributions.map((d) => d.contentUrl)).toContain(
      `${BASE}/data/projects.json`,
    );
  });
});

describe("websiteJsonLd", () => {
  it("uses the locale's own URL", () => {
    expect(websiteJsonLd({ baseUrl: BASE, locale: "ro", name: "X" }).url).toBe(
      `${BASE}/ro`,
    );
  });
});

describe("breadcrumbList", () => {
  const crumbs = breadcrumbList({
    baseUrl: BASE,
    locale: "en",
    items: [
      { name: "Projects", path: "/projects" },
      { name: "A1 motorway", path: "/projects/ro-a1" },
    ],
  });

  it("numbers positions from one", () => {
    const items = crumbs.itemListElement as { position: number }[];
    expect(items.map((i) => i.position)).toEqual([1, 2]);
  });

  it("makes each item an absolute, locale-prefixed URL", () => {
    const items = crumbs.itemListElement as { item: string }[];
    expect(items[1].item).toBe(`${BASE}/en/projects/ro-a1`);
  });
});
