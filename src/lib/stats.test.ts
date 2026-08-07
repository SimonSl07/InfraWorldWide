import { describe, it, expect } from "vitest";
import { computeStats } from "./stats";
import type { Project } from "./schema";

const projects = [
  {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1" },
    description: { en: "" },
    lots: [
      {
        id: "old",
        name: { en: "Old" },
        status: "opened",
        dates: { opened: "1972" },
        lengthKm: 96,
        geometryRef: "old",
      },
      {
        id: "new",
        name: { en: "New" },
        status: "opened",
        dates: { opened: "2015" },
        lengthKm: 50,
        geometryRef: "new",
      },
      {
        id: "wip",
        name: { en: "Wip" },
        status: "under_construction",
        lengthKm: 30,
        geometryRef: "wip",
      },
      {
        id: "future",
        name: { en: "Future" },
        status: "planned",
        lengthKm: 40,
        geometryRef: "future",
      },
    ],
    sources: [{ title: "S", url: "https://example.com" }],
  },
] as Project[];

describe("computeStats", () => {
  it("aggregates opened, recent and under-construction km", () => {
    const stats = computeStats(projects, 2026, 20);
    expect(stats.projectCount).toBe(1);
    expect(stats.countryCount).toBe(1);
    expect(stats.openedKm).toBe(146); // 96 + 50
    expect(stats.recentOpenedKm).toBe(50); // only 2015 is within 20 years
    expect(stats.underConstructionKm).toBe(30);
  });

  it("handles empty input", () => {
    expect(computeStats([], 2026)).toEqual({
      projectCount: 0,
      countryCount: 0,
      openedKm: 0,
      recentOpenedKm: 0,
      underConstructionKm: 0,
    });
  });
});
