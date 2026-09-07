import { describe, it, expect } from "vitest";
import { featureFilter } from "@maplibre/maplibre-gl-style-spec";
import {
  findCountry,
  lotMonths,
  lotStateAt,
  rankCountries,
  summarizeCountries,
  type LotMonths,
  type LotState,
} from "./country-stats";
import { buildMonthFilters, fullSelection, toMonthIndex } from "./map-filters";
import type { CountryRef, Lot, Project } from "./schema";

const NOW = toMonthIndex(2026, 8);

function lot(id: string, over: Partial<Lot> = {}): Lot {
  return {
    id,
    name: { en: id },
    status: "opened",
    lengthKm: 10,
    geometryRef: id,
    ...over,
  } as Lot;
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1" },
    description: { en: "" },
    lots: [],
    sources: [{ title: "s", url: "https://example.com" }],
    ...over,
  } as Project;
}

describe("lotStateAt", () => {
  const months = (over: Partial<LotMonths> = {}): LotMonths => ({
    openedMonth: null,
    constructionStartMonth: null,
    expectedOpeningMonth: null,
    ...over,
  });

  it("is opened from the month it opened", () => {
    const m = months({ openedMonth: toMonthIndex(2010, 6) });
    expect(lotStateAt(m, toMonthIndex(2010, 5), NOW)).not.toBe("opened");
    expect(lotStateAt(m, toMonthIndex(2010, 6), NOW)).toBe("opened");
    expect(lotStateAt(m, NOW, NOW)).toBe("opened");
  });

  it("is under construction between start and opening", () => {
    const m = months({
      constructionStartMonth: toMonthIndex(2008, 1),
      openedMonth: toMonthIndex(2012, 1),
    });
    expect(lotStateAt(m, toMonthIndex(2007, 1), NOW)).toBe("planned");
    expect(lotStateAt(m, toMonthIndex(2009, 1), NOW)).toBe(
      "under_construction",
    );
    expect(lotStateAt(m, toMonthIndex(2012, 1), NOW)).toBe("opened");
  });

  it("treats a lot with neither date as planned", () => {
    expect(lotStateAt(months(), NOW, NOW)).toBe("planned");
  });

  /**
   * The rule the whole dataset leans on: 19 lots have an opening date and no
   * construction start. Before they opened, nothing about them is known — so
   * they are "unknown", never counted as planned road that did not exist.
   */
  it("calls an opened lot with no recorded start 'unknown' beforehand", () => {
    const m = months({ openedMonth: toMonthIndex(1984, 1) });
    expect(lotStateAt(m, toMonthIndex(1980, 1), NOW)).toBe("unknown");
    expect(lotStateAt(m, toMonthIndex(1984, 1), NOW)).toBe("opened");
  });

  it("counts an expected opening only when looking into the future", () => {
    const m = months({ expectedOpeningMonth: toMonthIndex(2028, 1) });
    // Viewing 2028 from a "now" of 2026 — a projection, so it counts.
    expect(lotStateAt(m, toMonthIndex(2028, 6), NOW)).toBe("opened");
    // A section already past its expected date but not opened is late, not
    // delivered.
    expect(lotStateAt(m, NOW, toMonthIndex(2030, 1))).toBe("planned");
  });
});

/**
 * The panel describes the map, so its state rules must agree with the
 * MapLibre expressions the map actually renders — evaluated here through the
 * real style-spec filter, not a reimplementation of it.
 */
describe("lotStateAt agrees with the map's filters", () => {
  const cats = fullSelection();
  const matches = (spec: unknown, feature: unknown) =>
    featureFilter(spec as never).filter({ zoom: 6 } as never, feature as never);

  const cases: Array<{ name: string; months: LotMonths; status: string }> = [
    {
      name: "opened with a recorded start",
      status: "opened",
      months: {
        openedMonth: toMonthIndex(2012, 1),
        constructionStartMonth: toMonthIndex(2008, 1),
        expectedOpeningMonth: null,
      },
    },
    {
      name: "opened without a recorded start",
      status: "opened",
      months: {
        openedMonth: toMonthIndex(1984, 1),
        constructionStartMonth: null,
        expectedOpeningMonth: null,
      },
    },
    {
      name: "building, not yet open",
      status: "under_construction",
      months: {
        openedMonth: null,
        constructionStartMonth: toMonthIndex(2024, 3),
        expectedOpeningMonth: toMonthIndex(2028, 1),
      },
    },
    {
      name: "planned, nothing recorded",
      status: "planned",
      months: {
        openedMonth: null,
        constructionStartMonth: null,
        expectedOpeningMonth: null,
      },
    },
    {
      name: "tendered with a future start",
      status: "tendered",
      months: {
        openedMonth: null,
        constructionStartMonth: toMonthIndex(2027, 6),
        expectedOpeningMonth: toMonthIndex(2031, 1),
      },
    },
  ];

  const viewed = [
    toMonthIndex(1980, 1),
    toMonthIndex(2000, 1),
    toMonthIndex(2010, 1),
    toMonthIndex(2024, 6),
    NOW,
    toMonthIndex(2029, 1),
  ];

  for (const c of cases) {
    for (const month of viewed) {
      it(`${c.name} @ ${month}`, () => {
        const feature = {
          type: 2 as const,
          properties: { category: "highway", status: c.status, ...c.months },
        };
        const f = buildMonthFilters(month, cats, NOW);
        const state = lotStateAt(c.months, month, NOW);

        expect(matches(f.opened, feature)).toBe(state === "opened");
        expect(matches(f.underConstruction, feature)).toBe(
          state === "under_construction",
        );
        // The map only draws the not-started layer at the present or later;
        // the filter itself still describes membership of it.
        expect(matches(f.future, feature)).toBe(state === "planned");
      });
    }
  }
});

describe("summarizeCountries", () => {
  const projects = [
    project({
      id: "ro-a1",
      country: "ro",
      category: "highway",
      lots: [
        lot("l1", { dates: { opened: "2010-06" }, lengthKm: 100 }),
        lot("l2", {
          status: "under_construction",
          dates: { constructionStart: "2024-01" },
          lengthKm: 50,
        }),
      ],
    }),
    project({
      id: "ro-rail",
      country: "ro",
      category: "railway",
      lots: [lot("l3", { dates: { opened: "2015-01" }, lengthKm: 30 })],
    }),
    project({
      id: "bg-a1",
      country: "bg",
      category: "highway",
      lots: [lot("l4", { dates: { opened: "2005-01" }, lengthKm: 80 })],
    }),
  ];

  /**
   * Two metro lines through-running one tunnel each list it, because each
   * line really is that long, but the network is not. Operators publish it
   * the same way: Sofia's four lines sum to 66.5 km against a 55.0 km
   * system, and Bucharest breaks out M3's "8.67 km (M1 shared section)".
   */
  it("counts track shared between two lines once", () => {
    const shared = [
      project({
        id: "bg-m1",
        country: "bg",
        category: "railway",
        lots: [lot("tunnel", { dates: { opened: "2010-01" }, lengthKm: 14 })],
      }),
      project({
        id: "bg-m4",
        country: "bg",
        category: "railway",
        lots: [
          lot("own", { dates: { opened: "2015-01" }, lengthKm: 9 }),
          lot("through-run", {
            dates: { opened: "2010-01" },
            lengthKm: 14,
            sharedWith: "bg-m1",
          }),
        ],
      }),
    ];
    const [bg] = summarizeCountries(shared, NOW, NOW);
    // 14 + 9, not 14 + 9 + 14.
    expect(bg.total.openedKm).toBe(23);
    expect(bg.byCategory.railway.lots).toBe(2);
  });

  it("splits length by category and state at the viewed month", () => {
    const [bg, ro] = summarizeCountries(projects, NOW, NOW);
    expect(bg.code).toBe("bg");
    expect(ro.byCategory.highway.openedKm).toBe(100);
    expect(ro.byCategory.highway.underConstructionKm).toBe(50);
    expect(ro.byCategory.railway.openedKm).toBe(30);
    expect(ro.total.openedKm).toBe(130);
    expect(ro.projects).toBe(2);
  });

  it("reflects the month being viewed", () => {
    const ro = summarizeCountries(projects, toMonthIndex(2012, 1), NOW).find(
      (s) => s.code === "ro",
    )!;
    // The railway had not opened yet, and the 2024 site was not a site.
    expect(ro.total.openedKm).toBe(100);
    expect(ro.total.underConstructionKm).toBe(0);
    expect(ro.byCategory.railway.openedKm).toBe(0);
  });

  it("ignores cancelled lots", () => {
    const cancelled = [
      project({
        lots: [lot("x", { status: "cancelled", dates: { opened: "2010-01" } })],
      }),
    ];
    const [ro] = summarizeCountries(cancelled, NOW, NOW);
    expect(ro.total.openedKm).toBe(0);
    expect(ro.projects).toBe(0);
  });

  /**
   * The map hides not-yet-started lots when looking at the past, so the
   * totals — and the project count with them — must hide them too.
   */
  it("ignores not-yet-started lots when viewing the past", () => {
    const withPlanned = [
      project({
        id: "ro-future",
        lots: [
          lot("p", { status: "planned", lengthKm: 500, dates: undefined }),
        ],
      }),
    ];
    const past = summarizeCountries(withPlanned, toMonthIndex(2005, 1), NOW)[0];
    expect(past.total.plannedKm).toBe(0);
    expect(past.projects).toBe(0);

    const present = summarizeCountries(withPlanned, NOW, NOW)[0];
    expect(present.total.plannedKm).toBe(500);
    expect(present.projects).toBe(1);
  });

  it("counts nothing for a lot whose state that month is unknown", () => {
    const historic = [
      project({ lots: [lot("h", { dates: { opened: "1984-01" } })] }),
    ];
    const [ro] = summarizeCountries(historic, toMonthIndex(1980, 1), NOW);
    expect(ro.total.lots).toBe(0);
    expect(ro.total.plannedKm).toBe(0);
  });
});

describe("rankCountries", () => {
  const refs: Record<string, CountryRef> = {
    ro: {
      areaKm2: 238391,
      population: 19_000_000,
      populationDate: "2026-01",
      sources: [{ title: "s", url: "https://example.com" }],
    },
    bg: {
      areaKm2: 110879,
      population: 6_400_000,
      populationDate: "2026-01",
      sources: [{ title: "s", url: "https://example.com" }],
    },
  };

  const projects = [
    project({
      id: "ro-a1",
      country: "ro",
      lots: [lot("l1", { dates: { opened: "2010-01" }, lengthKm: 1000 })],
    }),
    project({
      id: "bg-a1",
      country: "bg",
      lots: [lot("l2", { dates: { opened: "2010-01" }, lengthKm: 800 })],
    }),
  ];

  it("orders by opened km and ranks per category", () => {
    const ranked = rankCountries(projects, refs, NOW, NOW);
    expect(ranked.map((r) => r.summary.code)).toEqual(["ro", "bg"]);
    expect(findCountry(ranked, "ro")!.ranks.openedKm.highway).toEqual({
      position: 1,
      of: 2,
    });
    expect(findCountry(ranked, "bg")!.ranks.openedKm.all).toEqual({
      position: 2,
      of: 2,
    });
  });

  it("does not rank a country on a category it has nothing in", () => {
    const ranked = rankCountries(projects, refs, NOW, NOW);
    expect(findCountry(ranked, "ro")!.ranks.openedKm.railway).toBeNull();
  });

  it("ranks density separately, so the smaller country can lead", () => {
    const ranked = rankCountries(projects, refs, NOW, NOW);
    // Bulgaria: 800 km over 110,879 km² beats Romania's 1,000 over 238,391.
    expect(findCountry(ranked, "bg")!.ranks.kmPerArea!.position).toBe(1);
    expect(findCountry(ranked, "ro")!.ranks.kmPerArea!.position).toBe(2);
    expect(findCountry(ranked, "bg")!.kmPerArea).toBeCloseTo(7.215, 3);
  });

  it("leaves density null for a country with no reference row", () => {
    const ranked = rankCountries(projects, { ro: refs.ro }, NOW, NOW);
    expect(findCountry(ranked, "bg")!.kmPerArea).toBeNull();
    expect(findCountry(ranked, "bg")!.ranks.kmPerArea).toBeNull();
  });

  it("gives tied countries the same position", () => {
    const tied = [
      project({
        id: "ro-a1",
        country: "ro",
        lots: [lot("a", { dates: { opened: "2010-01" }, lengthKm: 500 })],
      }),
      project({
        id: "bg-a1",
        country: "bg",
        lots: [lot("b", { dates: { opened: "2010-01" }, lengthKm: 500 })],
      }),
    ];
    const ranked = rankCountries(tied, refs, NOW, NOW);
    expect(findCountry(ranked, "ro")!.ranks.openedKm.all!.position).toBe(1);
    expect(findCountry(ranked, "bg")!.ranks.openedKm.all!.position).toBe(1);
  });
});

describe("lotMonths", () => {
  it("reads the dates a lot actually carries", () => {
    expect(
      lotMonths(
        lot("a", {
          dates: { opened: "2010-06", constructionStart: "2007" },
        }),
      ),
    ).toEqual({
      openedMonth: toMonthIndex(2010, 6),
      constructionStartMonth: toMonthIndex(2007, 1),
      expectedOpeningMonth: null,
    });
  });
});

/** Exhaustive switch guard: adding a state must break this on purpose. */
describe("LotState", () => {
  it("has exactly the four documented states", () => {
    const states: LotState[] = [
      "opened",
      "under_construction",
      "planned",
      "unknown",
    ];
    expect(new Set(states).size).toBe(4);
  });
});
