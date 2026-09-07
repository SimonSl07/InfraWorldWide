import { describe, it, expect } from "vitest";
import {
  collectErrors,
  checkProjectGeometry,
  checkStatusDates,
  checkPriceCoverage,
  checkLotContractors,
  checkCostPerKm,
  checkSourceQuality,
  hasElapsed,
  checkReferenceKeys,
  checkPartOf,
  checkCostRevisions,
  checkEvents,
  checkLocaleKeys,
  checkFxCoverage,
} from "./index";
import { hasContractTerms } from "../schema";
import type {
  ContractorRegistry,
  DeflatorTable,
  FxTable,
  Project,
} from "../schema";

/**
 * Integration test: every project file committed under data/projects must
 * validate against the schema and have matching geometry. Runs against the
 * real repo data so a bad data edit fails `npm test` too, not just builds.
 */
describe("seed data integrity", () => {
  it("all committed projects validate with zero errors", () => {
    const { projects, errors } = collectErrors(process.cwd());
    expect(errors).toEqual([]);
    expect(projects.length).toBeGreaterThan(0);
  });

  /**
   * The map needs an outline to make a country clickable and a reference row
   * to show its densities. collectErrors reports both, so this only has to
   * assert the table is actually populated — a countries.json that parsed
   * but held nothing would otherwise pass the check above.
   */
  it("every country with projects has area and population figures", () => {
    const { projects, countries } = collectErrors(process.cwd());
    const used = [...new Set(projects.map((p) => p.country))].sort();
    expect(Object.keys(countries?.countries ?? {}).sort()).toEqual(used);
  });

  /**
   * The four single-position LineStrings this check was written for drew
   * nothing on the map while still counting toward every length total, and
   * nothing failed. Pinned separately from the blanket error assertion above
   * so a regression names the geometry rather than a count.
   */
  it("every committed lot geometry is a drawable line", () => {
    const { errors } = collectErrors(process.cwd());
    expect(
      errors.filter(
        (e) =>
          e.includes("position(s)") ||
          e.includes("expected LineString") ||
          e.includes("out of range") ||
          e.includes("non-finite") ||
          e.includes("duplicate geometryRef") ||
          e.includes("matches no lot"),
      ),
    ).toEqual([]);
  });

  /**
   * The quality tiers, pinned on the real data: everything below is a gap
   * worth seeing, none of it is a reason to fail a build. Fixed "today" so
   * the elapsed-deadline rule cannot start failing this on its own.
   */
  it("keeps quality gaps in the warning tier", () => {
    const { errors, warnings } = collectErrors(process.cwd(), {
      today: "2026-08-14",
    });
    const warningShapes = [
      /draws .* against lengthKm/,
      /has no registry entry/,
      /is under_construction with no dates\.constructionStart/,
      /is tendered with no dates\.tenderAwarded/,
      /cannot be restated/,
      /has no price year/,
      /rests on 1 source/,
      /has elapsed and the lot is still/,
      /is outside the plausible/,
      /is referenced by no lot/,
      /event history stops at/,
      /but its events imply/,
      /has a partial_opening event/,
      /disagrees with dates\./,
      /disagrees with the newest/,
    ];
    for (const w of warnings) {
      expect(
        warningShapes.some((shape) => shape.test(w)),
        `unclassified warning: ${w}`,
      ).toBe(true);
    }
    for (const shape of warningShapes) {
      expect(errors.filter((e) => shape.test(e))).toEqual([]);
    }
  });

  /**
   * The ODbL obligation, pinned separately: it is a licence term, and the
   * check found one project already in breach when it was written.
   */
  it("cites OpenStreetMap wherever geometry is OSM-derived", () => {
    const { errors } = collectErrors(process.cwd(), { today: "2026-08-14" });
    expect(errors.filter((e) => e.includes("OpenStreetMap"))).toEqual([]);
  });

  /** AGENTS.md bans the em dash; nothing enforced it before. */
  it("has no em dash anywhere under data/ or messages/", () => {
    const { errors } = collectErrors(process.cwd(), { today: "2026-08-14" });
    expect(errors.filter((e) => e.includes("em dash"))).toEqual([]);
  });

  /**
   * Every contract block left in the data states a term. The 127 that held
   * only prose became lot.note, so "N lots have contract terms" now counts
   * lots that actually do.
   */
  it("has no contract block that proves nothing", () => {
    const { projects } = collectErrors(process.cwd(), { today: "2026-08-14" });
    const empty = projects.flatMap((p) =>
      p.lots
        .filter((l) => l.contract && !hasContractTerms(l.contract))
        .map((l) => `${p.id}/${l.id}`),
    );
    expect(empty).toEqual([]);
  });
});

/**
 * "Today" is injected everywhere below, so a rule about elapsed deadlines is
 * pinned rather than quietly changing meaning as the clock runs.
 */
describe("hasElapsed", () => {
  it("compares at the precision the date was written with", () => {
    // A year-only deadline is not missed until the year is over.
    expect(hasElapsed("2026", "2026-08-14")).toBe(false);
    expect(hasElapsed("2026", "2027-01-01")).toBe(true);
    expect(hasElapsed("2026-07", "2026-08-14")).toBe(true);
    expect(hasElapsed("2026-08", "2026-08-14")).toBe(false);
    expect(hasElapsed("2026-08-13", "2026-08-14")).toBe(true);
    expect(hasElapsed("2026-08-14", "2026-08-14")).toBe(false);
  });
});

function lotStub(over: Record<string, unknown> = {}) {
  return {
    id: "lot-1",
    name: { en: "Lot 1" },
    status: "planned",
    lengthKm: 10,
    geometryRef: "lot-1",
    ...over,
  };
}

function projectStub(lots: Array<Record<string, unknown>>, over = {}) {
  return {
    id: "xx-test",
    country: "xx",
    category: "highway",
    name: { en: "T" },
    description: { en: "d" },
    lots,
    sources: [{ title: "T", url: "https://example.com/a" }],
    ...over,
  } as unknown as Project;
}

describe("checkStatusDates", () => {
  const today = "2026-08-14";

  it("passes a coherent lot", () => {
    const p = projectStub([
      lotStub({ status: "opened", dates: { opened: "2020-05" } }),
    ]);
    expect(checkStatusDates([p], today)).toEqual({ errors: [], warnings: [] });
  });

  it("errors on a contradiction the data cannot mean", () => {
    const planned = projectStub([
      lotStub({ status: "planned", dates: { opened: "2020" } }),
    ]);
    expect(checkStatusDates([planned], today).errors[0]).toContain(
      'status "planned" but has dates.opened',
    );

    const future = projectStub([
      lotStub({ status: "opened", dates: { opened: "2027-03" } }),
    ]);
    expect(checkStatusDates([future], today).errors[0]).toContain(
      "opened (2027-03) is in the future",
    );
  });

  it("warns on a missing start or award date rather than failing", () => {
    const uc = projectStub([lotStub({ status: "under_construction" })]);
    const r = checkStatusDates([uc], today);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain("no dates.constructionStart");

    const te = projectStub([lotStub({ status: "tendered" })]);
    expect(checkStatusDates([te], today).warnings[0]).toContain(
      "no dates.tenderAwarded",
    );
  });

  it("warns the moment an expected opening elapses, not before", () => {
    const due = projectStub([
      lotStub({
        status: "under_construction",
        dates: { constructionStart: "2024", expectedOpening: "2026" },
      }),
    ]);
    expect(checkStatusDates([due], "2026-12-31").warnings).toEqual([]);
    const slipped = checkStatusDates([due], "2027-01-01").warnings;
    expect(slipped[0]).toContain("expectedOpening (2026) has elapsed");
  });

  it("says nothing about an elapsed expected opening on an opened lot", () => {
    const done = projectStub([
      lotStub({
        status: "opened",
        dates: { expectedOpening: "2020", opened: "2021" },
      }),
    ]);
    expect(checkStatusDates([done], today).warnings).toEqual([]);
  });
});

const deflators = {
  baseYear: 2015,
  note: "n",
  sources: [],
  series: {
    EUR: { geo: "EA", label: { en: "EUR" }, index: { "2020": 100 } },
    RON: { geo: "RO", label: { en: "RON" }, index: { "2020": 100 } },
  },
} as unknown as DeflatorTable;

const fx = {
  base: "EUR",
  note: "n",
  sources: [],
  rates: { RON: { label: { en: "RON" }, perEur: { "2020": 4.8 } } },
} as unknown as FxTable;

describe("checkPriceCoverage", () => {
  it("passes a figure whose currency and year both have coverage", () => {
    const p = projectStub([
      lotStub({
        cost: { actual: { amount: 10, currency: "RON", year: 2020 } },
      }),
    ]);
    expect(checkPriceCoverage(deflators, fx, [p])).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("warns when the price year is outside the published series", () => {
    const p = projectStub([
      lotStub({
        cost: { actual: { amount: 10, currency: "RON", year: 2026 } },
      }),
    ]);
    const w = checkPriceCoverage(deflators, fx, [p]).warnings;
    expect(w.join(" ")).toContain("2026");
    expect(w.join(" ")).toContain("fx");
    expect(w.join(" ")).toContain("deflator");
  });

  it("warns once that a year-less figure can never be compared", () => {
    const p = projectStub([
      lotStub({ cost: { actual: { amount: 10, currency: "EUR" } } }),
    ]);
    const r = checkPriceCoverage(deflators, fx, [p]);
    expect(r.errors).toEqual([]);
    expect(r.warnings[0]).toContain("no price year");
  });

  it("says nothing about a programme figure, which is never ranked", () => {
    const p = projectStub([lotStub()], {
      cost: { amount: 745, currency: "EUR", scope: "programme" },
    });
    expect(checkPriceCoverage(deflators, fx, [p]).warnings).toEqual([]);
  });

  /** A revision used to slip past this; only the flat fields were walked. */
  it("warns about a revision priced in a year the tables do not reach", () => {
    const p = projectStub([
      lotStub({
        cost: {
          revisions: [
            {
              kind: "award",
              date: "2026-03",
              money: { amount: 10, currency: "RON", year: 2026 },
            },
          ],
        },
      }),
    ]);
    const w = checkPriceCoverage(deflators, fx, [p]).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("cost.revisions[0]");
    expect(w[0]).toContain("cannot be restated");
  });
});

/**
 * The currency-level check walks the same `moneyOf` as the price-year one,
 * so a revision is held to it like a flat lot cost. Figures nothing converts,
 * a funding share or a project-level total, stay in the warning tier: an
 * unknown currency there is a coverage gap, not a defect.
 */
describe("checkFxCoverage", () => {
  const check = (p: Project) => {
    const errors: string[] = [];
    checkFxCoverage(fx, [p], errors);
    return errors;
  };

  it("passes the base currency and one with rates", () => {
    const p = projectStub(
      [
        lotStub({
          cost: { actual: { amount: 10, currency: "RON", year: 2020 } },
        }),
      ],
      { cost: { amount: 100, currency: "EUR", year: 2020 } },
    );
    expect(check(p)).toEqual([]);
  });

  it("errors on a revision in a currency the fx table lacks", () => {
    const p = projectStub([
      lotStub({
        cost: {
          revisions: [
            {
              kind: "award",
              date: "2020",
              money: { amount: 5, currency: "CHF", year: 2020 },
            },
          ],
        },
      }),
    ]);
    expect(check(p)).toEqual([
      'data/fx.json: no rates for "CHF", which costs are recorded in',
    ]);
  });

  it("leaves a funding share in an unknown currency to the warning tier", () => {
    const p = projectStub([
      lotStub({
        funding: [
          {
            source: "loan",
            amount: { amount: 5, currency: "CHF", year: 2020 },
          },
        ],
      }),
    ]);
    // Nothing converts a co-financing share, so the build must not fail on
    // it; the price-coverage check still says the table does not reach it.
    expect(check(p)).toEqual([]);
    expect(checkPriceCoverage(deflators, fx, [p]).warnings.join(" ")).toContain(
      "fx",
    );
  });

  it("leaves a project-level total in an unknown currency to the warning tier", () => {
    const p = projectStub([lotStub()], {
      cost: { amount: 100, currency: "GBP", year: 2020 },
    });
    expect(check(p)).toEqual([]);
  });
});

const registry = {
  note: "n",
  contractors: [{ id: "astaldi", name: "Astaldi", aliases: ["Astaldi SpA"] }],
} as unknown as ContractorRegistry;

describe("checkLotContractors", () => {
  it("accepts a registered firm, by name or alias", () => {
    const p = projectStub([
      lotStub({ contractors: [{ name: "Astaldi SpA" }, { name: "Astaldi" }] }),
    ]);
    expect(checkLotContractors(registry, [p]).warnings).toEqual([]);
  });

  it("warns once per distinct unregistered name", () => {
    const p = projectStub([
      lotStub({ contractors: [{ name: "Nobody Ltd" }] }),
      lotStub({ id: "lot-2", contractors: [{ name: "Nobody Ltd" }] }),
    ]);
    const w = checkLotContractors(registry, [p]).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("Nobody Ltd");
  });
});

describe("checkCostPerKm", () => {
  it("passes an ordinary motorway figure", () => {
    const p = projectStub([
      lotStub({
        lengthKm: 20,
        cost: { actual: { amount: 200, currency: "EUR", year: 2020 } },
      }),
    ]);
    expect(checkCostPerKm(fx, [p]).warnings).toEqual([]);
  });

  it("catches an amount entered in units instead of millions", () => {
    const p = projectStub([
      lotStub({
        lengthKm: 20,
        cost: { actual: { amount: 200000, currency: "EUR", year: 2020 } },
      }),
    ]);
    expect(checkCostPerKm(fx, [p]).warnings[0]).toContain("per km");
  });

  it("allows a bridge to cost far more per km than a motorway", () => {
    const p = projectStub(
      [
        lotStub({
          lengthKm: 2,
          cost: { actual: { amount: 500, currency: "EUR", year: 2020 } },
        }),
      ],
      { category: "bridge" },
    );
    expect(checkCostPerKm(fx, [p]).warnings).toEqual([]);
  });

  it("holds a revision to the band, since it prices the same section", () => {
    const p = projectStub([
      lotStub({
        lengthKm: 20,
        cost: {
          revisions: [
            {
              kind: "award",
              date: "2020",
              money: { amount: 200000, currency: "EUR", year: 2020 },
            },
          ],
        },
      }),
    ]);
    const w = checkCostPerKm(fx, [p]).warnings;
    expect(w).toHaveLength(1);
    expect(w[0]).toContain("cost.revisions[0]");
  });

  /** An addendum is what one variation order added, not the section's price. */
  it("does not judge an addendum per km", () => {
    const p = projectStub([
      lotStub({
        lengthKm: 30,
        cost: {
          revisions: [
            {
              kind: "addendum",
              date: "2021",
              money: { amount: 3, currency: "EUR", year: 2021 },
            },
          ],
        },
      }),
    ]);
    expect(checkCostPerKm(fx, [p]).warnings).toEqual([]);
  });

  /** A co-financing share is a slice of who pays, not the section's cost. */
  it("never judges a funding share per km", () => {
    const p = projectStub([
      lotStub({
        lengthKm: 20,
        funding: [
          {
            source: "EU",
            amount: { amount: 200000, currency: "EUR", year: 2020 },
          },
        ],
      }),
    ]);
    expect(checkCostPerKm(fx, [p]).warnings).toEqual([]);
  });
});

describe("checkSourceQuality", () => {
  const geoWithOsm = { features: [{ properties: { _source: "OSM" } }] };

  it("errors when OSM-derived geometry is not cited, as ODbL requires", () => {
    const p = projectStub([lotStub()]);
    const e = checkSourceQuality([p], () => geoWithOsm).errors;
    expect(e[0]).toContain("OpenStreetMap");
  });

  it("accepts an OpenStreetMap citation by url", () => {
    const p = projectStub([lotStub()], {
      sources: [
        { title: "OSM", url: "https://www.openstreetmap.org/copyright" },
        { title: "T", url: "https://example.com/a" },
      ],
    });
    expect(checkSourceQuality([p], () => geoWithOsm).errors).toEqual([]);
  });

  it("warns about a project resting on a single source", () => {
    const p = projectStub([lotStub()]);
    expect(checkSourceQuality([p], () => null).warnings[0]).toContain(
      "1 source",
    );
  });

  it("errors on a sourceRef that resolves to nothing", () => {
    const p = projectStub([lotStub({ sourceRefs: ["ghost"] })], {
      sources: [
        { id: "a", title: "T", url: "https://example.com/a" },
        { title: "U", url: "https://example.com/b" },
      ],
    });
    expect(checkSourceQuality([p], () => null).errors[0]).toContain("ghost");
  });

  it("errors on a duplicate source id within one project", () => {
    const p = projectStub([lotStub({ sourceRefs: ["a"] })], {
      sources: [
        { id: "a", title: "T", url: "https://example.com/a" },
        { id: "a", title: "U", url: "https://example.com/b" },
      ],
    });
    expect(checkSourceQuality([p], () => null).errors[0]).toContain(
      'duplicate source id "a"',
    );
  });
});

describe("checkReferenceKeys", () => {
  const corridors = {
    note: "n",
    corridors: {
      "pan-european-iv": {
        scheme: "pan-european" as const,
        name: { en: "IV" },
        sources: [{ title: "T", url: "https://example.com/a" }],
      },
    },
  };
  const operators = {
    note: "n",
    operators: {
      "ro-cnair": {
        name: "CNAIR",
        country: "ro",
        role: "road_authority" as const,
        sources: [{ title: "T", url: "https://example.com/a" }],
      },
    },
  };
  const programmes = {
    note: "n",
    programmes: {
      "ro-pnrr": {
        name: { en: "PNRR" },
        instrument: "grant" as const,
        authority: "EC",
        sources: [{ title: "T", url: "https://example.com/a" }],
      },
    },
  };

  const used = projectStub(
    [lotStub({ funding: [{ source: "EU", programme: "ro-pnrr" }] })],
    { corridors: ["pan-european-iv"], operator: "ro-cnair" },
  );

  it("passes when every key resolves and every entry is used", () => {
    expect(
      checkReferenceKeys(corridors, programmes, operators, [used]),
    ).toEqual({ errors: [], warnings: [] });
  });

  it("errors on a key that resolves to nothing", () => {
    const bad = projectStub(
      [lotStub({ funding: [{ source: "EU", programme: "nope" }] })],
      {
        corridors: ["ghost"],
        operator: "who",
      },
    );
    const e = checkReferenceKeys(corridors, programmes, operators, [
      bad,
    ]).errors;
    expect(e.join(" ")).toContain("ghost");
    expect(e.join(" ")).toContain("who");
    expect(e.join(" ")).toContain("nope");
  });

  it("errors on a table entry no project uses, as cities does", () => {
    const e = checkReferenceKeys(corridors, programmes, operators, [
      projectStub([lotStub()]),
    ]).errors;
    expect(e.join(" ")).toContain("pan-european-iv");
    expect(e.join(" ")).toContain("ro-cnair");
    expect(e.join(" ")).toContain("ro-pnrr");
  });
});

describe("checkPartOf", () => {
  const parent = projectStub([lotStub()], { id: "ro-a1" });

  it("accepts a lot pointing at the project that contains it", () => {
    const child = projectStub([lotStub({ partOf: "ro-a1" })], {
      id: "ro-tunnels",
    });
    expect(checkPartOf([parent, child])).toEqual({ errors: [], warnings: [] });
  });

  it("rejects a dangling or self pointer", () => {
    const dangling = projectStub([lotStub({ partOf: "ro-ghost" })], {
      id: "ro-x",
    });
    expect(checkPartOf([dangling]).errors[0]).toContain("ro-ghost");
    const self = projectStub([lotStub({ partOf: "ro-x" })], { id: "ro-x" });
    expect(checkPartOf([self]).errors[0]).toContain("its own project");
  });

  it("rejects a chain, which would make the exclusion rule ambiguous", () => {
    const mid = projectStub([lotStub({ partOf: "ro-a1" })], { id: "ro-mid" });
    const leaf = projectStub([lotStub({ partOf: "ro-mid" })], {
      id: "ro-leaf",
    });
    expect(checkPartOf([parent, mid, leaf]).errors[0]).toContain(
      "itself part of another project",
    );
  });

  it("rejects a parent in another country", () => {
    const child = projectStub([lotStub({ partOf: "ro-a1" })], {
      id: "bg-x",
      country: "bg",
    });
    expect(checkPartOf([parent, child]).errors[0]).toContain(
      "different country",
    );
  });
});

describe("checkEvents", () => {
  const withSource = (lot: Record<string, unknown>) =>
    projectStub([lotStub(lot)], {
      sources: [{ id: "src-a", title: "T", url: "https://example.com/a" }],
    });

  it("passes a history that agrees with the status", () => {
    const p = withSource({
      status: "opened",
      dates: { opened: "2012-07" },
      events: [
        { kind: "construction_start", date: "2008", sourceRef: "src-a" },
        { kind: "opened", date: "2012-07", sourceRef: "src-a" },
      ],
    });
    expect(checkEvents([p])).toEqual({ errors: [], warnings: [] });
  });

  it("errors on an event sourceRef that resolves to nothing", () => {
    const p = withSource({
      status: "planned",
      events: [{ kind: "announced", date: "2008", sourceRef: "ghost" }],
    });
    expect(checkEvents([p]).errors[0]).toContain("ghost");
  });

  it("warns when the history implies a different status", () => {
    const p = withSource({
      status: "tendered",
      events: [
        { kind: "tender_launched", date: "2013" },
        { kind: "tender_cancelled", date: "2015" },
      ],
    });
    expect(checkEvents([p]).warnings[0]).toContain("cancelled");
  });

  /** The Comarnic–Brașov shape: part in service, whole drawn as tendered. */
  it("warns when part of a lot is open but the lot is not", () => {
    const p = withSource({
      status: "tendered",
      events: [{ kind: "partial_opening", date: "2020-12" }],
    });
    const w = checkEvents([p]).warnings.join(" ");
    expect(w).toContain("partial_opening");
    expect(w).toContain("split");
  });

  it("warns when an event date contradicts the matching dates field", () => {
    const p = withSource({
      status: "opened",
      dates: { opened: "2012-07", constructionStart: "2008-05" },
      events: [
        { kind: "construction_start", date: "2009-05" },
        { kind: "opened", date: "2012-07" },
      ],
    });
    expect(checkEvents([p]).warnings[0]).toContain("constructionStart");
  });
});

describe("checkCostRevisions", () => {
  const withSources = (revisions: unknown[]) =>
    projectStub([lotStub({ cost: { revisions } })], {
      sources: [{ id: "src-a", title: "T", url: "https://example.com/a" }],
    });

  it("accepts a chain whose sourceRefs resolve", () => {
    const p = withSources([
      {
        kind: "estimate",
        date: "2018",
        money: { amount: 1, currency: "EUR", year: 2018 },
        sourceRef: "src-a",
      },
    ]);
    expect(checkCostRevisions([p])).toEqual({ errors: [], warnings: [] });
  });

  it("errors on a revision sourceRef that resolves to nothing", () => {
    const p = withSources([
      {
        kind: "outturn",
        date: "2020",
        money: { amount: 1, currency: "EUR", year: 2020 },
        sourceRef: "ghost",
      },
    ]);
    expect(checkCostRevisions([p]).errors[0]).toContain("ghost");
  });

  it("warns when the chain and the flat field disagree", () => {
    const p = projectStub([
      lotStub({
        cost: {
          actual: { amount: 100, currency: "EUR", year: 2020 },
          revisions: [
            {
              kind: "outturn",
              date: "2020",
              money: { amount: 130, currency: "EUR", year: 2020 },
            },
          ],
        },
      }),
    ]);
    expect(checkCostRevisions([p]).warnings[0]).toContain("disagrees");
  });
});

describe("checkLocaleKeys", () => {
  it("accepts locales that have a messages file", () => {
    expect(
      checkLocaleKeys({ name: { en: "x", ro: "y" } }, "f.json", ["en", "ro"]),
    ).toEqual([]);
  });

  it("catches a typo that catchall cannot", () => {
    const e = checkLocaleKeys({ name: { en: "x", rp: "y" } }, "f.json", [
      "en",
      "ro",
    ]);
    expect(e[0]).toContain("rp");
  });

  it("looks inside arrays and nested objects", () => {
    const e = checkLocaleKeys(
      { lots: [{ note: { en: "x", de: "y" } }] },
      "f.json",
      ["en", "ro"],
    );
    expect(e[0]).toContain("de");
  });
});

/** A one-lot project stub; only the fields the geometry check reads matter. */
function stubProject(lots: Array<{ id: string; ref: string; km: number }>) {
  return {
    id: "xx-test",
    country: "xx",
    lots: lots.map((l) => ({
      id: l.id,
      geometryRef: l.ref,
      lengthKm: l.km,
    })),
  } as unknown as Project;
}

function feature(ref: string, geometry: unknown) {
  return { properties: { geometryRef: ref }, geometry } as never;
}

/** ~111 km: one degree of latitude. */
const oneDegree = {
  type: "LineString",
  coordinates: [
    [25, 44],
    [25, 45],
  ],
};

describe("checkProjectGeometry", () => {
  const project = stubProject([{ id: "lot-1", ref: "a", km: 111.2 }]);

  it("passes a clean line whose drawn length matches lengthKm", () => {
    const report = checkProjectGeometry(
      project,
      { features: [feature("a", oneDegree)] },
      "geo.geojson",
    );
    expect(report).toEqual({ errors: [], warnings: [] });
  });

  it("rejects a single-position LineString", () => {
    const { errors } = checkProjectGeometry(
      project,
      {
        features: [
          feature("a", { type: "LineString", coordinates: [[25, 44]] }),
        ],
      },
      "geo.geojson",
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("1 position(s)");
  });

  it("rejects a part of a MultiLineString with one position", () => {
    const { errors } = checkProjectGeometry(
      project,
      {
        features: [
          feature("a", {
            type: "MultiLineString",
            coordinates: [oneDegree.coordinates, [[25, 46]]],
          }),
        ],
      },
      "geo.geojson",
    );
    expect(errors[0]).toContain("position(s)");
  });

  it("rejects a geometry that is not a line", () => {
    const { errors } = checkProjectGeometry(
      project,
      { features: [feature("a", { type: "Point", coordinates: [25, 44] })] },
      "geo.geojson",
    );
    expect(errors[0]).toContain("is a Point");
  });

  it("rejects coordinates off the globe or non-finite", () => {
    const out = checkProjectGeometry(
      project,
      {
        features: [
          feature("a", {
            type: "LineString",
            coordinates: [
              [25, 44],
              [181, 44],
            ],
          }),
        ],
      },
      "geo.geojson",
    );
    expect(out.errors[0]).toContain("out of range");

    const nan = checkProjectGeometry(
      project,
      {
        features: [
          feature("a", {
            type: "LineString",
            coordinates: [
              [25, 44],
              [25, null],
            ],
          }),
        ],
      },
      "geo.geojson",
    );
    expect(nan.errors[0]).toContain("non-finite");
  });

  it("rejects a duplicate geometryRef in one file", () => {
    const { errors } = checkProjectGeometry(
      project,
      { features: [feature("a", oneDegree), feature("a", oneDegree)] },
      "geo.geojson",
    );
    expect(errors).toContain('geo.geojson: duplicate geometryRef "a"');
  });

  it("rejects an orphan feature no lot points at", () => {
    const { errors } = checkProjectGeometry(
      project,
      { features: [feature("a", oneDegree), feature("ghost", oneDegree)] },
      "geo.geojson",
    );
    expect(errors).toContain(
      'geo.geojson: feature "ghost" matches no lot in xx-test',
    );
  });

  it("still reports a missing geometryRef", () => {
    const { errors } = checkProjectGeometry(
      project,
      { features: [] },
      "geo.geojson",
    );
    expect(errors[0]).toContain("not found in geo.geojson");
  });

  it("warns, but does not fail, when drawn length is outside the band", () => {
    const short = checkProjectGeometry(
      stubProject([{ id: "lot-1", ref: "a", km: 200 }]),
      { features: [feature("a", oneDegree)] },
      "geo.geojson",
    );
    expect(short.errors).toEqual([]);
    expect(short.warnings[0]).toContain("ratio 0.56");

    const long = checkProjectGeometry(
      stubProject([{ id: "lot-1", ref: "a", km: 50 }]),
      { features: [feature("a", oneDegree)] },
      "geo.geojson",
    );
    expect(long.errors).toEqual([]);
    expect(long.warnings[0]).toContain("ratio 2.22");
  });

  it("accepts lengths just inside the band", () => {
    for (const km of [111.19 / 1.19, 111.19 / 0.86]) {
      const report = checkProjectGeometry(
        stubProject([{ id: "lot-1", ref: "a", km }]),
        { features: [feature("a", oneDegree)] },
        "geo.geojson",
      );
      expect(report.warnings).toEqual([]);
    }
  });
});
