import { describe, it, expect } from "vitest";
import { computeStats, dataYearRange } from "./stats";
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

  it("excludes shared track from every total", () => {
    // A lot borrowed from another project counts toward its own line's length
    // but not toward any figure spanning projects. See AGENTS.md.
    const withShared = [
      ...projects,
      {
        id: "ro-metro-m3",
        country: "ro",
        category: "railway",
        name: { en: "M3" },
        description: { en: "" },
        lots: [
          {
            id: "borrowed",
            name: { en: "Borrowed" },
            status: "opened",
            dates: { opened: "2020" },
            lengthKm: 8.67,
            geometryRef: "borrowed",
            sharedWith: "ro-metro-m1",
          },
          {
            id: "borrowed-wip",
            name: { en: "Borrowed under construction" },
            status: "under_construction",
            lengthKm: 3.6,
            geometryRef: "borrowed-wip",
            sharedWith: "ro-metro-m1",
          },
        ],
        sources: [{ title: "S", url: "https://example.com" }],
      },
    ] as Project[];

    const stats = computeStats(withShared, 2026, 20);
    expect(stats.openedKm).toBe(146);
    expect(stats.recentOpenedKm).toBe(50);
    expect(stats.underConstructionKm).toBe(30);
    // The project itself still counts, only its borrowed track is dropped.
    expect(stats.projectCount).toBe(2);
  });

  it("excludes a lot that is part of another project's lot", () => {
    // A tunnel recorded in ro-tunnels sits inside a section the parent
    // project already counts, so counting both inflates the network by the
    // length of the tunnel. Same rule as shared track, different pointer.
    const withPart = [
      ...projects,
      {
        id: "ro-tunnels",
        country: "ro",
        category: "tunnel",
        name: { en: "Tunnels" },
        description: { en: "" },
        lots: [
          {
            id: "poiana",
            name: { en: "Poiana" },
            status: "under_construction",
            lengthKm: 1.5,
            geometryRef: "poiana",
            partOf: "ro-a1",
          },
        ],
        sources: [{ title: "S", url: "https://example.com" }],
      },
    ] as Project[];

    const stats = computeStats(withPart, 2026, 20);
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

describe("dataYearRange", () => {
  it("spans the earliest and latest dated event", () => {
    // 1972 opened through 2015 opened in the fixture above.
    expect(dataYearRange(projects)).toEqual({ first: 1972, last: 2015 });
  });

  it("counts scheduled openings, not just delivered ones", () => {
    const withFuture = [
      {
        ...projects[0],
        lots: [
          ...projects[0].lots,
          {
            id: "soon",
            name: { en: "Soon" },
            status: "under_construction",
            dates: { expectedOpening: "2030" },
            lengthKm: 10,
            geometryRef: "soon",
          },
        ],
      },
    ] as Project[];
    expect(dataYearRange(withFuture).last).toBe(2030);
  });

  it("falls back when nothing is dated", () => {
    expect(dataYearRange([], 2026)).toEqual({ first: 2026, last: 2026 });
  });
});
