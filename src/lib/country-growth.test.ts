import { describe, it, expect } from "vitest";
import { openedKmByDecade, peakDecade } from "./country-growth";
import type { Lot, Project } from "./schema";

function project(
  country: string,
  category: Project["category"],
  lots: Array<Partial<Lot>>,
): Project {
  return {
    id: `${country}-x`,
    country,
    category,
    name: { en: "x" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.com" }],
    lots: lots.map((l, i) => ({
      id: `l${i}`,
      name: { en: `l${i}` },
      status: "opened",
      lengthKm: 10,
      geometryRef: `l${i}`,
      ...l,
    })),
  } as Project;
}

describe("openedKmByDecade", () => {
  const projects = [
    project("ro", "highway", [
      { dates: { opened: "1972-05" }, lengthKm: 96 },
      { dates: { opened: "2004-01" }, lengthKm: 50 },
      { dates: { opened: "2009-12" }, lengthKm: 30 },
    ]),
    project("ro", "railway", [{ dates: { opened: "2004-06" }, lengthKm: 20 }]),
    project("bg", "highway", [{ dates: { opened: "1998-01" }, lengthKm: 40 }]),
  ];

  it("buckets openings by decade and splits them by category", () => {
    const buckets = openedKmByDecade(projects, "ro");
    expect(buckets[0].decade).toBe(1970);
    expect(buckets[0].km).toBe(96);
    const twoThousands = buckets.find((b) => b.decade === 2000)!;
    expect(twoThousands.km).toBe(100);
    expect(twoThousands.byCategory.highway).toBe(80);
    expect(twoThousands.byCategory.railway).toBe(20);
  });

  it("keeps empty decades so the time axis stays linear", () => {
    const decades = openedKmByDecade(projects, "ro").map((b) => b.decade);
    expect(decades).toEqual([1970, 1980, 1990, 2000]);
    const eighties = openedKmByDecade(projects, "ro").find(
      (b) => b.decade === 1980,
    )!;
    expect(eighties.km).toBe(0);
  });

  it("accumulates the running total", () => {
    const buckets = openedKmByDecade(projects, "ro");
    expect(buckets.map((b) => b.cumulativeKm)).toEqual([96, 96, 96, 196]);
  });

  it("filters to one country, and covers all of them when none is given", () => {
    expect(openedKmByDecade(projects, "bg").map((b) => b.decade)).toEqual([
      1990,
    ]);
    expect(openedKmByDecade(projects).at(-1)!.cumulativeKm).toBe(236);
  });

  it("ignores lots with no opening date and cancelled ones", () => {
    const sparse = [
      project("ro", "highway", [
        { dates: { opened: "2000-01" }, lengthKm: 10 },
        { status: "planned", lengthKm: 999, dates: undefined },
        { status: "cancelled", dates: { opened: "2000-01" }, lengthKm: 999 },
      ]),
    ];
    const buckets = openedKmByDecade(sparse, "ro");
    expect(buckets).toHaveLength(1);
    expect(buckets[0].km).toBe(10);
  });

  it("returns nothing for a country with no dated openings", () => {
    expect(openedKmByDecade(projects, "xx")).toEqual([]);
  });
});

describe("peakDecade", () => {
  it("finds the busiest decade", () => {
    const buckets = openedKmByDecade(
      [
        project("ro", "highway", [
          { dates: { opened: "1972-01" }, lengthKm: 96 },
          { dates: { opened: "2004-01" }, lengthKm: 150 },
        ]),
      ],
      "ro",
    );
    expect(peakDecade(buckets)!.decade).toBe(2000);
  });

  it("is null when nothing opened", () => {
    expect(peakDecade([])).toBeNull();
  });
});
