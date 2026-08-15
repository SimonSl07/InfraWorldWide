import { describe, expect, it } from "vitest";
import {
  COST_PER_KM_BANDS,
  bandForProject,
  findGaps,
  periodEndMonth,
  type GapScanInput,
} from "./gaps";
import type {
  DeflatorTable,
  FxTable,
  Lot,
  Money,
  Project,
  Status,
} from "./schema";

const deflators: DeflatorTable = {
  baseYear: 2015,
  note: "test",
  sources: [{ title: "t", url: "https://example.org/" }],
  series: {
    EUR: {
      geo: "EA",
      label: { en: "Euro area" },
      index: { "2015": 100, "2016": 101, "2017": 102 },
    },
    RON: {
      geo: "RO",
      label: { en: "Romania" },
      index: { "2015": 100, "2016": 102 },
    },
  },
};

const fx: FxTable = {
  base: "EUR",
  note: "test",
  sources: [{ title: "t", url: "https://example.org/" }],
  rates: {
    RON: { label: { en: "Romanian leu" }, perEur: { "2015": 4.5, "2016": 4.5 } },
  },
};

function lot(id: string, over: Partial<Lot> = {}): Lot {
  return {
    id,
    name: { en: id, ro: id },
    status: "opened" as Status,
    dates: { opened: "2015", constructionStart: "2013", tenderAwarded: "2012" },
    lengthKm: 10,
    cost: { estimated: money(100), actual: money(110) },
    funding: [{ source: "EU" }],
    contractors: [{ name: "Somebody" }],
    contract: { totalMonths: 24 },
    geometryRef: id,
    ...over,
  };
}

function money(amount: number, currency = "EUR", year = 2015): Money {
  return { amount, currency, year };
}

function project(over: Partial<Project> = {}): Project {
  return {
    id: "ro-a1",
    country: "ro",
    category: "highway",
    name: { en: "A1", ro: "A1" },
    description: { en: "d", ro: "d" },
    lots: [lot("l1")],
    sources: [
      { title: "one", url: "https://example.org/1" },
      { title: "two", url: "https://example.org/2" },
    ],
    ...over,
  };
}

function scan(projects: Project[], today = "2026-08"): GapScanInput {
  return { projects, deflators, fx, today };
}

/** Codes reported for a scan, in order. */
function codes(input: GapScanInput): string[] {
  return findGaps(input).map((g) => g.id.split("/").pop()!);
}

describe("findGaps", () => {
  it("reports nothing structural for a fully populated project", () => {
    const gaps = findGaps(scan([project()]));
    expect(gaps.filter((g) => g.priority !== "info")).toEqual([]);
  });

  it("always emits one coverage row per deflator and fx series", () => {
    const gaps = findGaps(scan([project()])).filter((g) => g.priority === "info");
    expect(gaps.map((g) => g.project).sort()).toEqual([
      "deflator:EUR",
      "deflator:RON",
      "fx:RON",
    ]);
    const eur = gaps.find((g) => g.project === "deflator:EUR")!;
    expect(eur.detail).toBe("2015-2017");
    expect(eur.country).toBe("EA");
    expect(eur.whereToLook).toBe("data/deflators.json");
  });
});

describe("cost gaps", () => {
  it("flags a lot with no cost at all, with length and status in the detail", () => {
    const gaps = findGaps(scan([project({ lots: [lot("l1", { cost: undefined })] })]));
    const gap = gaps.find((g) => g.id.endsWith("no-cost"))!;
    expect(gap.priority).toBe("high");
    expect(gap.field).toBe("cost");
    expect(gap.issue).toBe("no cost at all");
    expect(gap.detail).toBe("10 km, opened");
    expect(gap.whereToLook).toBe("data/projects/ro/a1.json");
    expect(gap.id).toBe("ro/ro-a1/l1/no-cost");
  });

  it("flags an opened lot that has an estimate but no outturn", () => {
    const gaps = findGaps(
      scan([project({ lots: [lot("l1", { cost: { estimated: money(100) } })] })]),
    );
    const gap = gaps.find((g) => g.id.endsWith("opened-no-actual"))!;
    expect(gap.priority).toBe("high");
    expect(gap.detail).toBe("est 100M EUR 2015");
  });

  it("flags an outturn with no estimate to compare it against", () => {
    const gaps = findGaps(
      scan([project({ lots: [lot("l1", { cost: { actual: money(110) } })] })]),
    );
    const gap = gaps.find((g) => g.id.endsWith("no-estimate"))!;
    expect(gap.priority).toBe("medium");
    expect(gap.detail).toBe("actual 110M EUR 2015");
  });

  it("flags a project where no lot at all carries an outturn cost", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [
            lot("l1", { cost: { estimated: money(100) } }),
            lot("l2", { cost: { estimated: money(100) } }),
          ],
        }),
      ]),
    );
    const gap = gaps.find((g) => g.id.endsWith("project-no-actual"))!;
    expect(gap.lot).toBe("");
    expect(gap.detail).toBe("2 lots");
    expect(gap.priority).toBe("high");
  });

  it("does not flag the project when a single lot carries an outturn", () => {
    expect(codes(scan([project()]))).not.toContain("project-no-actual");
  });
});

describe("reference-table coverage", () => {
  it("flags a price year with no deflator entry and no fx rate", () => {
    const cost = { estimated: money(570, "RON", 2026) };
    const gaps = findGaps(scan([project({ lots: [lot("l1", { cost })] })]));
    const deflator = gaps.find((g) => g.id.endsWith("no-deflator"))!;
    expect(deflator.priority).toBe("high");
    expect(deflator.field).toBe("cost.estimated");
    expect(deflator.detail).toBe("570M RON 2026");
    expect(deflator.whereToLook).toBe("data/deflators.json");

    const rate = gaps.find((g) => g.id.endsWith("no-fx"))!;
    expect(rate.priority).toBe("high");
    expect(rate.whereToLook).toBe("data/fx.json");
  });

  it("does not ask fx for a cost already in the base currency", () => {
    const cost = { estimated: money(570, "EUR", 2026) };
    expect(codes(scan([project({ lots: [lot("l1", { cost })] })]))).not.toContain(
      "no-fx",
    );
  });

  it("flags a figure with no price year, and asks the tables nothing", () => {
    const cost = { estimated: { amount: 1162.81, currency: "USD" } };
    const gaps = findGaps(scan([project({ lots: [lot("l1", { cost })] })]));
    const gap = gaps.find((g) => g.id.endsWith("no-price-year"))!;
    expect(gap.priority).toBe("high");
    expect(gap.detail).toBe("1162.81M USD");
    expect(codes(scan([project({ lots: [lot("l1", { cost })] })]))).not.toContain("no-fx");
  });

  it("names the scope in the detail when the figure carries one", () => {
    const cost = { estimated: { ...money(2200), scope: "programme" as const } };
    const gaps = findGaps(scan([project({ lots: [lot("l1", { cost })] })]));
    const gap = gaps.find((g) => g.id.endsWith("opened-no-actual"))!;
    expect(gap.detail).toBe("est 2200M EUR 2015 (programme)");
  });

  it("covers contract values as well as costs", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [lot("l1", { contract: { value: money(50, "RON", 2026) } })],
        }),
      ]),
    );
    expect(gaps.some((g) => g.field === "contract.value")).toBe(true);
  });
});

describe("cost per km", () => {
  it("uses a wider band for a metro line than for a mainline railway", () => {
    const metro = project({ category: "railway", city: "ro-bucharest" });
    expect(bandForProject(metro)).toEqual(COST_PER_KM_BANDS.metro);
    expect(bandForProject(project({ category: "railway" }))).toEqual(
      COST_PER_KM_BANDS.railway,
    );
    expect(bandForProject(project())).toEqual(COST_PER_KM_BANDS.highway);
  });

  it("flags a figure above the category band", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [
            lot("l1", {
              lengthKm: 10,
              cost: { estimated: money(500) },
            }),
          ],
        }),
      ]),
    );
    const gap = gaps.find((g) => g.id.endsWith("cost-per-km-high"))!;
    expect(gap.priority).toBe("medium");
    expect(gap.detail).toBe("50.0 M EUR/km over 10 km (highway band 2-40)");
  });

  it("flags a figure below the category band", () => {
    const gaps = findGaps(
      scan([
        project({
          category: "railway",
          city: "ro-bucharest",
          lots: [lot("l1", { lengthKm: 2, cost: { actual: money(30) } })],
        }),
      ]),
    );
    const gap = gaps.find((g) => g.id.endsWith("cost-per-km-low"))!;
    expect(gap.field).toBe("cost.actual");
    expect(gap.detail).toBe("15.0 M EUR/km over 2 km (metro band 20-250)");
  });

  it("converts to euro before comparing, and skips what it cannot convert", () => {
    const convertible = project({
      lots: [lot("l1", { lengthKm: 10, cost: { estimated: money(900, "RON", 2016) } })],
    });
    // 900M RON / 4.5 = 200M EUR over 10 km = 20 M EUR/km, inside the band.
    expect(codes(scan([convertible]))).not.toContain("cost-per-km-high");

    const unconvertible = project({
      lots: [lot("l1", { lengthKm: 10, cost: { estimated: money(900, "RON", 2026) } })],
    });
    expect(codes(scan([unconvertible]))).not.toContain("cost-per-km-high");
  });

  it("leaves a programme or part figure out of the band check", () => {
    // A whole-programme total is not the cost of one lot, and a design-only
    // figure is a fraction of one. Flagging either says nothing new.
    const overBand = (scope: "programme" | "design" | "works") =>
      codes(
        scan([
          project({
            lots: [
              lot("l1", {
                lengthKm: 10,
                cost: { estimated: { ...money(500), scope } },
              }),
            ],
          }),
        ]),
      ).includes("cost-per-km-high");
    expect(overBand("programme")).toBe(false);
    expect(overBand("design")).toBe(false);
    expect(overBand("works")).toBe(true);
  });

  it("flags an outturn priced far from the year the lot opened", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [
            lot("l1", {
              dates: { opened: "2020", constructionStart: "2013", tenderAwarded: "2012" },
              cost: { estimated: money(100), actual: money(110, "EUR", 2016) },
            }),
          ],
        }),
      ]),
    );
    const gap = gaps.find((g) => g.id.endsWith("price-year-far-from-opening"))!;
    expect(gap.priority).toBe("low");
    expect(gap.detail).toBe("price year 2016, opened 2020");
  });
});

describe("date gaps", () => {
  it("flags an opened lot with no construction start", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [lot("l1", { dates: { opened: "1984", tenderAwarded: "1980" } })],
        }),
      ]),
    );
    const gap = gaps.find((g) => g.id.endsWith("opened-no-construction-start"))!;
    expect(gap.priority).toBe("high");
    expect(gap.detail).toBe("opened 1984");
  });

  it("flags an under-construction lot with no start and no expected opening", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [lot("l1", { status: "under_construction", dates: {} })],
        }),
      ]),
    );
    const start = gaps.find((g) => g.id.endsWith("building-no-construction-start"))!;
    expect(start.priority).toBe("high");
    const opening = gaps.find((g) => g.id.endsWith("building-no-expected-opening"))!;
    expect(opening.priority).toBe("medium");
    expect(opening.detail).toBe("start ?");
  });

  it("names the start date when one is recorded", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [
            lot("l1", { status: "under_construction", dates: { constructionStart: "2023-09" } }),
          ],
        }),
      ]),
    );
    const gap = gaps.find((g) => g.id.endsWith("building-no-expected-opening"))!;
    expect(gap.detail).toBe("start 2023-09");
  });

  it("flags an opened lot with no tender award date", () => {
    const gaps = findGaps(
      scan([project({ lots: [lot("l1", { dates: { opened: "2012-06", constructionStart: "2010" } })] })]),
    );
    const gap = gaps.find((g) => g.id.endsWith("no-tender-award"))!;
    expect(gap.priority).toBe("low");
    expect(gap.detail).toBe("opened 2012-06");
  });

  it("flags planned and tendered lots with nothing on the calendar", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [
            lot("l1", { status: "planned", dates: {} }),
            lot("l2", { status: "tendered", dates: {} }),
          ],
        }),
      ]),
    );
    expect(gaps.find((g) => g.id === "ro/ro-a1/l1/no-schedule-date")!.issue).toBe(
      "planned lot has no announced or expected date",
    );
    expect(gaps.find((g) => g.id === "ro/ro-a1/l2/no-schedule-date")!.issue).toBe(
      "tendered lot has no announced or expected date",
    );
  });
});

describe("overdue expected openings", () => {
  const overdue = (expectedOpening: string, today: string, status: Status = "under_construction") =>
    codes(
      scan(
        [project({ lots: [lot("l1", { status, dates: { expectedOpening } })] })],
        today,
      ),
    ).includes("overdue-expected-opening");

  it("treats a year-only date as due at the end of that year", () => {
    // The whole point: 8 committed lots are due in "2026" and none of them is
    // late in August 2026. Reading "2026" as January would report all eight.
    expect(overdue("2026", "2026-08")).toBe(false);
    expect(overdue("2026", "2026-12")).toBe(false);
    expect(overdue("2026", "2027-01")).toBe(true);
  });

  it("treats a month date as due at the end of that month", () => {
    expect(overdue("2026-08", "2026-08")).toBe(false);
    expect(overdue("2026-08", "2026-09")).toBe(true);
    expect(overdue("2026-08-14", "2026-08")).toBe(false);
  });

  it("only applies to lots still tendered or under construction", () => {
    expect(overdue("2020", "2026-08", "tendered")).toBe(true);
    expect(overdue("2020", "2026-08", "planned")).toBe(false);
    expect(overdue("2020", "2026-08", "cancelled")).toBe(false);
  });

  it("reports the missed date and how long ago it was", () => {
    const gaps = findGaps(
      scan(
        [
          project({
            lots: [
              lot("l1", {
                status: "under_construction",
                dates: { constructionStart: "2018", expectedOpening: "2024-06" },
              }),
            ],
          }),
        ],
        "2026-08",
      ),
    );
    const gap = gaps.find((g) => g.id.endsWith("overdue-expected-opening"))!;
    expect(gap.priority).toBe("high");
    expect(gap.field).toBe("dates.expectedOpening");
    expect(gap.detail).toBe("expected 2024-06, 26 months ago, still under_construction");
  });
});

describe("periodEndMonth", () => {
  it("resolves a partial date to the last month it covers", () => {
    expect(periodEndMonth("2026")).toBe(2026 * 12 + 11);
    expect(periodEndMonth("2026-03")).toBe(2026 * 12 + 2);
    expect(periodEndMonth("2026-03-15")).toBe(2026 * 12 + 2);
    expect(periodEndMonth("nonsense")).toBeNull();
  });
});

describe("attribution gaps", () => {
  it("flags missing contractors and funding with the status in the detail", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [lot("l1", { contractors: [], funding: undefined, lengthKm: 3.5 })],
        }),
      ]),
    );
    const contractors = gaps.find((g) => g.id.endsWith("no-contractors"))!;
    expect(contractors.priority).toBe("medium");
    expect(contractors.detail).toBe("opened, 3.5 km");
    const funding = gaps.find((g) => g.id.endsWith("no-funding"))!;
    expect(funding.detail).toBe("opened");
  });

  it("flags a tendered or ongoing lot with no contracted duration or value", () => {
    const gaps = findGaps(
      scan([
        project({
          lots: [
            lot("l1", { status: "under_construction", contract: undefined }),
            // A block that only links the award notice records no terms.
            lot("l2", {
              status: "tendered",
              contract: { noticeReference: "award report" },
            }),
            lot("l3", { status: "under_construction", contract: { executionMonths: 20 } }),
            lot("l4", { status: "under_construction", contract: { value: money(50) } }),
            lot("l5", { status: "opened", contract: undefined }),
          ],
        }),
      ]),
    );
    expect(gaps.filter((g) => g.id.endsWith("no-contract-terms")).map((g) => g.lot)).toEqual([
      "l1",
      "l2",
    ]);
  });

  it("flags a project resting on a single source", () => {
    const gaps = findGaps(
      scan([project({ sources: [{ title: "only", url: "https://example.org/1" }] })]),
    );
    const gap = gaps.find((g) => g.id.endsWith("single-source"))!;
    expect(gap.priority).toBe("medium");
    expect(gap.detail).toBe("https://example.org/1");
  });

  it("flags missing Romanian strings on the project and on each lot", () => {
    const gaps = findGaps(
      scan([
        project({
          name: { en: "A1" },
          description: { en: "d" },
          lots: [lot("l1", { name: { en: "l1" } })],
        }),
      ]),
    );
    expect(gaps.find((g) => g.id.endsWith("name-ro-missing"))!.issue).toBe(
      "missing Romanian name",
    );
    expect(gaps.find((g) => g.id.endsWith("description-ro-missing"))!.priority).toBe("low");
    expect(gaps.find((g) => g.id.endsWith("lot-name-ro-missing"))!.issue).toBe(
      "missing Romanian lot name",
    );
  });
});

describe("ordering", () => {
  it("sorts by priority, then country, project and lot", () => {
    const gaps = findGaps(
      scan([
        project({
          id: "rs-x",
          country: "rs",
          lots: [lot("z", { cost: undefined })],
        }),
        project({
          id: "bg-x",
          country: "bg",
          name: { en: "bg" },
          lots: [lot("a", { cost: undefined })],
        }),
      ]),
    );
    const ordered = gaps
      .filter((g) => g.priority !== "info")
      .map((g) => `${g.priority}:${g.country}:${g.lot}`);
    // Project-level rows (no lot) lead their project, as in the hand-made CSV.
    expect(ordered).toEqual([
      "high:bg:",
      "high:bg:a",
      "high:rs:",
      "high:rs:z",
      "low:bg:",
    ]);
  });
});
