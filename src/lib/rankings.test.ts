import { describe, it, expect } from "vitest";
import {
  bestOverruns,
  bestSlips,
  collectLotMetrics,
  coverage,
  deliveredOnTime,
  median,
  underBudget,
  rankByContractor,
  rankByCountry,
  sortGroups,
  worstOverruns,
  worstSlips,
  type LotMetric,
} from "./rankings";
import { createContractorResolver } from "./contractors";
import { createDeflator } from "./deflator";
import { monthIndex } from "./contract";
import type { ContractorRegistry, DeflatorTable, Project } from "./schema";

const table: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "Euro area" },
      index: { "2015": 100, "2020": 105, "2021": 107.78, "2025": 128.75 },
    },
  },
};

const registry: ContractorRegistry = {
  note: "test",
  contractors: [{ id: "astaldi", name: "Astaldi", aliases: ["Astaldi SpA"] }],
};

const opts = {
  deflate: createDeflator(table),
  priceYear: 2021,
  resolve: createContractorResolver(registry),
  nowMonth: monthIndex("2026-08")!,
};

/**
 * Three lots, all in the same price year so overruns are easy to read:
 *   ro-a1/l1  +50% vs estimate, +200% vs award, opened 12 months late
 *   ro-a1/l2  −10% vs estimate, opened 6 months early
 *   bg-x/l3   no cost data, still under construction and 67 months overdue
 */
const projects: Project[] = [
  {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: "l1",
        name: { en: "Lot 1" },
        status: "opened",
        lengthKm: 20,
        geometryRef: "l1",
        dates: { constructionStart: "2018-01", opened: "2021-01" },
        contract: {
          executionMonths: 24,
          value: { amount: 500, currency: "EUR", year: 2021 },
        },
        cost: {
          estimated: { amount: 1000, currency: "EUR", year: 2021 },
          actual: { amount: 1500, currency: "EUR", year: 2021 },
        },
        contractors: [
          { name: "Astaldi SpA", role: "builder" },
          { name: "Some Designer", role: "designer" },
        ],
      },
      {
        id: "l2",
        name: { en: "Lot 2" },
        status: "opened",
        lengthKm: 10,
        geometryRef: "l2",
        dates: { constructionStart: "2018-01", opened: "2019-07" },
        contract: { executionMonths: 24 },
        cost: {
          estimated: { amount: 1000, currency: "EUR", year: 2021 },
          actual: { amount: 900, currency: "EUR", year: 2021 },
        },
        contractors: [{ name: "Strabag", role: "builder" }],
      },
    ],
  },
  {
    id: "bg-x",
    country: "bg",
    category: "railway",
    name: { en: "X" },
    description: { en: "" },
    sources: [{ title: "s", url: "https://example.org" }],
    lots: [
      {
        id: "l3",
        name: { en: "Lot 3" },
        status: "under_construction",
        lengthKm: 30,
        geometryRef: "l3",
        dates: { constructionStart: "2019-01" },
        contract: { executionMonths: 24 },
        contractors: [{ name: "Astaldi – Strabag (JV)", role: "builder" }],
      },
    ],
  },
];

const metrics = collectLotMetrics(projects, opts);
const byLot = (id: string) => metrics.find((m) => m.lotId === id)!;

describe("collectLotMetrics", () => {
  it("produces one metric per lot", () => {
    expect(metrics.map((m) => m.lotId)).toEqual(["l1", "l2", "l3"]);
  });

  it("carries project context onto each lot", () => {
    expect(byLot("l3")).toMatchObject({
      projectId: "bg-x",
      country: "bg",
      category: "railway",
      status: "under_construction",
      lengthKm: 30,
    });
  });

  it("computes both overrun bases", () => {
    expect(byLot("l1").overrun.estimate!.pct).toBeCloseTo(50, 6);
    expect(byLot("l1").overrun.award!.pct).toBeCloseTo(200, 6);
  });

  it("leaves a basis null when its inputs are missing", () => {
    expect(byLot("l2").overrun.award).toBeNull();
    expect(byLot("l3").overrun.estimate).toBeNull();
  });

  it("computes slip for delivered and in-progress lots alike", () => {
    expect(byLot("l1").slip).toMatchObject({
      kind: "completed",
      slipMonths: 12,
    });
    expect(byLot("l2").slip).toMatchObject({
      kind: "completed",
      slipMonths: -6,
    });
    expect(byLot("l3").slip).toMatchObject({ kind: "ongoing", slipMonths: 67 });
  });

  it("credits builders only, resolving aliases and joint ventures", () => {
    expect(byLot("l1").contractors.map((c) => c.id)).toEqual(["astaldi"]);
    expect(byLot("l3").contractors.map((c) => c.id)).toEqual([
      "astaldi",
      "strabag",
    ]);
  });
});

describe("coverage", () => {
  it("reports how much of the data each metric could be computed for", () => {
    expect(coverage(metrics)).toEqual({
      lots: 3,
      overrun: { estimate: 2, award: 1 },
      slip: { completed: 2, ongoing: 1 },
    });
  });
});

describe("lot rankings", () => {
  it("orders worst overruns first", () => {
    expect(
      worstOverruns(metrics, "estimate").map((e) => e.metric.lotId),
    ).toEqual(["l1", "l2"]);
  });

  it("orders best overruns first", () => {
    const best = bestOverruns(metrics, "estimate");
    expect(best[0].metric.lotId).toBe("l2");
    expect(best[0].overrun.pct).toBeCloseTo(-10, 6);
  });

  it("keeps the two bases separate", () => {
    expect(worstOverruns(metrics, "award").map((e) => e.metric.lotId)).toEqual([
      "l1",
    ]);
  });

  it("honours a limit", () => {
    expect(worstOverruns(metrics, "estimate", 1)).toHaveLength(1);
  });

  it("orders worst slips first across both kinds", () => {
    expect(worstSlips(metrics).map((e) => e.metric.lotId)).toEqual([
      "l3",
      "l1",
      "l2",
    ]);
  });

  it("filters slips by kind", () => {
    expect(
      worstSlips(metrics, { kind: "completed" }).map((e) => e.metric.lotId),
    ).toEqual(["l1", "l2"]);
    expect(
      worstSlips(metrics, { kind: "ongoing" }).map((e) => e.metric.lotId),
    ).toEqual(["l3"]);
  });

  it("ranks best slips over delivered lots only", () => {
    expect(bestSlips(metrics).map((e) => e.metric.lotId)).toEqual(["l2", "l1"]);
  });

  it("lists only lots that actually met their contract date", () => {
    // l1 opened 12 months late, so it is not a good outcome however the
    // list is sorted.
    expect(deliveredOnTime(metrics).map((e) => e.metric.lotId)).toEqual(["l2"]);
  });

  it("returns nothing on time when every measured lot ran late", () => {
    expect(deliveredOnTime([byLot("l1")])).toEqual([]);
  });

  it("lists only lots that actually came in at or under budget", () => {
    expect(underBudget(metrics, "estimate").map((e) => e.metric.lotId)).toEqual(
      ["l2"],
    );
    expect(underBudget(metrics, "award")).toEqual([]);
  });
});

describe("median", () => {
  it("handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("rankByContractor", () => {
  const groups = rankByContractor(metrics);
  const group = (key: string) => groups.find((g) => g.key === key)!;

  it("credits a joint venture lot to each partner", () => {
    expect(group("astaldi").lots).toBe(2); // l1 alone, l3 via the JV
    expect(group("strabag").lots).toBe(2); // l2 alone, l3 via the JV
  });

  it("excludes designers", () => {
    expect(groups.map((g) => g.key)).not.toContain("some-designer");
  });

  it("sums length across a firm's lots", () => {
    expect(group("astaldi").km).toBe(50);
  });

  it("summarizes overrun and slip per firm", () => {
    expect(group("astaldi").overrun.estimate).toMatchObject({ n: 1 });
    expect(group("astaldi").overrun.estimate.median).toBeCloseTo(50, 6);
    expect(group("astaldi").slip).toMatchObject({
      n: 2,
      median: 39.5,
      worst: 67,
      best: 12,
    });
  });

  it("reports the share of delivered lots that were on time", () => {
    expect(group("astaldi").onTimeShare).toBe(0); // l1 late; l3 not delivered
    expect(group("strabag").onTimeShare).toBe(1); // l2 early
  });

  it("leaves onTimeShare null for a firm with nothing delivered", () => {
    const jvOnly = rankByContractor([byLot("l3")]);
    expect(jvOnly.every((g) => g.onTimeShare === null)).toBe(true);
  });
});

describe("rankByCountry", () => {
  const groups = rankByCountry(metrics);
  const group = (key: string) => groups.find((g) => g.key === key)!;

  it("groups lots by country", () => {
    expect(groups.map((g) => g.key).sort()).toEqual(["bg", "ro"]);
    expect(group("ro").lots).toBe(2);
    expect(group("ro").km).toBe(30);
  });

  it("takes the median across a country's lots", () => {
    expect(group("ro").overrun.estimate.median).toBeCloseTo(20, 6); // 50 and −10
    expect(group("ro").slip.median).toBe(3); // 12 and −6
  });

  it("has no contractor kind", () => {
    expect(group("ro").kind).toBeUndefined();
  });

  it("drops lots another project already measures", () => {
    // Both markers mean the same thing for a total spanning projects: the
    // kilometres are already inside another project's figures. Counting
    // them again is the 38 km the homepage used to overstate.
    const extra = collectLotMetrics(
      [
        {
          ...projects[0],
          id: "ro-tunnels",
          lots: [
            {
              id: "poiana",
              name: { en: "Poiana tunnel" },
              status: "under_construction",
              lengthKm: 1.7,
              geometryRef: "poiana",
              partOf: "ro-a1",
            },
            {
              id: "through-run",
              name: { en: "Shared tunnel" },
              status: "under_construction",
              lengthKm: 8.67,
              geometryRef: "through-run",
              sharedWith: "ro-metro-m1",
            },
          ],
        },
      ],
      opts,
    );
    const ro = rankByCountry([...metrics, ...extra]).find(
      (g) => g.key === "ro",
    )!;
    expect(ro.lots).toBe(2);
    expect(ro.km).toBe(30);
  });
});

describe("sortGroups", () => {
  const groups = rankByContractor(metrics);

  it("puts the worst median first", () => {
    expect(
      sortGroups(groups, { metric: "slip", direction: "worst" }).map(
        (g) => g.key,
      ),
    ).toEqual(["astaldi", "strabag"]);
  });

  it("puts the best median first", () => {
    expect(
      sortGroups(groups, { metric: "slip", direction: "best" }).map(
        (g) => g.key,
      ),
    ).toEqual(["strabag", "astaldi"]);
  });

  it("drops groups the metric cannot be measured for", () => {
    // Only Astaldi has an award-basis overrun.
    expect(
      sortGroups(groups, { metric: "overrunAward", direction: "worst" }).map(
        (g) => g.key,
      ),
    ).toEqual(["astaldi"]);
  });

  it("drops groups below the sample threshold", () => {
    expect(
      sortGroups(groups, {
        metric: "overrunEstimate",
        direction: "worst",
        minLots: 2,
      }),
    ).toEqual([]);
    expect(
      sortGroups(groups, {
        metric: "slip",
        direction: "worst",
        minLots: 2,
      }).map((g) => g.key),
    ).toEqual(["astaldi", "strabag"]);
  });

  it("breaks ties on sample size", () => {
    const tied = [
      {
        ...groups[0],
        key: "small",
        slip: { n: 1, median: 5, worst: 5, best: 5 },
      },
      {
        ...groups[0],
        key: "large",
        slip: { n: 9, median: 5, worst: 5, best: 5 },
      },
    ];
    expect(
      sortGroups(tied, { metric: "slip", direction: "worst" }).map(
        (g) => g.key,
      ),
    ).toEqual(["large", "small"]);
  });

  it("honours a limit", () => {
    expect(
      sortGroups(groups, { metric: "slip", direction: "worst", limit: 1 }),
    ).toHaveLength(1);
  });

  it("returns nothing for empty input", () => {
    expect(sortGroups([], { metric: "slip", direction: "worst" })).toEqual([]);
  });
});

describe("empty input", () => {
  const none: LotMetric[] = [];
  it("produces empty rankings rather than throwing", () => {
    expect(worstOverruns(none, "estimate")).toEqual([]);
    expect(worstSlips(none)).toEqual([]);
    expect(rankByContractor(none)).toEqual([]);
    expect(rankByCountry(none)).toEqual([]);
    expect(coverage(none)).toEqual({
      lots: 0,
      overrun: { estimate: 0, award: 0 },
      slip: { completed: 0, ongoing: 0 },
    });
  });
});
