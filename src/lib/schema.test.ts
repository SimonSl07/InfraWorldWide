import { describe, it, expect } from "vitest";
import {
  projectSchema,
  lotSchema,
  localizedStringSchema,
  contractSchema,
  moneySchema,
  sourceSchema,
  dateYear,
  isComparableMoney,
  corridorTableSchema,
  programmeTableSchema,
  operatorTableSchema,
  lotEstimatedCost,
  lotActualCost,
  statusFromEvents,
  projectGeoPath,
} from "./schema";
import type { LocalizedString } from "./schema";

const validProject = {
  id: "ro-a1",
  country: "ro",
  category: "highway",
  name: { en: "A1" },
  description: { en: "desc" },
  lots: [
    {
      id: "lot-1",
      name: { en: "Lot 1" },
      status: "opened",
      dates: { opened: "2012-07-19" },
      lengthKm: 62,
      geometryRef: "lot-1",
    },
  ],
  sources: [{ title: "Wikipedia", url: "https://en.wikipedia.org/wiki/A1" }],
};

describe("projectSchema", () => {
  it("accepts a valid project", () => {
    expect(projectSchema.safeParse(validProject).success).toBe(true);
  });

  it("rejects a project id that does not start with the country code shape", () => {
    const bad = { ...validProject, id: "A1" };
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a project without sources", () => {
    const bad = { ...validProject, sources: [] };
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a lot without geometryRef", () => {
    const bad = {
      ...validProject,
      lots: [{ ...validProject.lots[0], geometryRef: "" }],
    };
    expect(projectSchema.safeParse(bad).success).toBe(false);
  });
});

describe("lotSchema date rules", () => {
  it("requires dates.opened when status is opened", () => {
    const lot = {
      id: "x",
      name: { en: "X" },
      status: "opened",
      lengthKm: 10,
      geometryRef: "x",
    };
    expect(lotSchema.safeParse(lot).success).toBe(false);
  });

  it("allows missing dates for planned lots", () => {
    const lot = {
      id: "x",
      name: { en: "X" },
      status: "planned",
      lengthKm: 10,
      geometryRef: "x",
    };
    expect(lotSchema.safeParse(lot).success).toBe(true);
  });

  it("accepts year-only and year-month dates, rejects garbage", () => {
    const base = {
      id: "x",
      name: { en: "X" },
      status: "under_construction",
      lengthKm: 10,
      geometryRef: "x",
    };
    expect(
      lotSchema.safeParse({ ...base, dates: { constructionStart: "2022" } })
        .success,
    ).toBe(true);
    expect(
      lotSchema.safeParse({ ...base, dates: { constructionStart: "2022-03" } })
        .success,
    ).toBe(true);
    expect(
      lotSchema.safeParse({
        ...base,
        dates: { constructionStart: "March 2022" },
      }).success,
    ).toBe(false);
  });
});

/**
 * A contract block is load-bearing: contractBaseline and computeSlip return
 * null without one, so a block holding only prose is a contract that proves
 * nothing while counting as coverage. Prose belongs in lot.note.
 */
describe("contractSchema", () => {
  it("accepts a block carrying any one substantive term", () => {
    for (const term of [
      { designMonths: 6 },
      { executionMonths: 24 },
      { totalMonths: 30 },
      { guaranteeMonths: 120 },
      { value: { amount: 313, currency: "EUR", year: 2021 } },
    ]) {
      expect(contractSchema.safeParse(term).success).toBe(true);
    }
  });

  it("rejects a block that only holds a notice reference or url", () => {
    expect(
      contractSchema.safeParse({ noticeReference: "a long prose note" })
        .success,
    ).toBe(false);
    expect(
      contractSchema.safeParse({ noticeUrl: "https://example.com/a" }).success,
    ).toBe(false);
    expect(contractSchema.safeParse({}).success).toBe(false);
  });
});

describe("moneySchema", () => {
  const base = { amount: 100, currency: "EUR" };

  it("accepts a figure with no price year, and marks it not comparable", () => {
    const parsed = moneySchema.safeParse(base);
    expect(parsed.success).toBe(true);
    expect(isComparableMoney(parsed.data!)).toBe(false);
    expect(isComparableMoney({ ...base, year: 2020 })).toBe(true);
  });

  it("accepts scope, confidence and a note", () => {
    expect(
      moneySchema.safeParse({
        ...base,
        year: 2020,
        scope: "programme",
        confidence: "reported",
        note: "covers the whole corridor",
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown scope or confidence", () => {
    expect(moneySchema.safeParse({ ...base, scope: "partial" }).success).toBe(
      false,
    );
    expect(
      moneySchema.safeParse({ ...base, confidence: "probably" }).success,
    ).toBe(false);
  });
});

describe("sourceSchema", () => {
  const base = { title: "T", url: "https://example.com/a" };

  it("accepts an id, a retrieval date and an archive url", () => {
    expect(
      sourceSchema.safeParse({
        ...base,
        id: "hotnews-bacau-bypass",
        retrievedOn: "2026-08-14",
        archiveUrl: "https://web.archive.org/web/2026/https://example.com/a",
      }).success,
    ).toBe(true);
  });

  it("rejects a malformed id or retrieval date", () => {
    expect(sourceSchema.safeParse({ ...base, id: "Bad Id" }).success).toBe(
      false,
    );
    expect(
      sourceSchema.safeParse({ ...base, retrievedOn: "14 August 2026" })
        .success,
    ).toBe(false);
  });
});

describe("lot note, sources and sourceRefs", () => {
  const base = {
    id: "x",
    name: { en: "X" },
    status: "planned",
    lengthKm: 10,
    geometryRef: "x",
  };

  it("accepts a localized note and lot-level sources", () => {
    expect(
      lotSchema.safeParse({
        ...base,
        note: { en: "Romania's first motorway, built 1967-1972." },
        sources: [{ title: "T", url: "https://example.com/a" }],
        sourceRefs: ["hotnews-x"],
      }).success,
    ).toBe(true);
  });

  it("rejects an empty note or an empty sourceRefs entry", () => {
    expect(lotSchema.safeParse({ ...base, note: { en: "" } }).success).toBe(
      false,
    );
    expect(lotSchema.safeParse({ ...base, sourceRefs: [""] }).success).toBe(
      false,
    );
  });
});

describe("project-level cost", () => {
  it("accepts a programme figure that is not broken out per lot", () => {
    const p = {
      ...validProject,
      cost: {
        amount: 745,
        currency: "EUR",
        year: 2019,
        scope: "programme",
        note: "covers the whole corridor, not broken out per section",
      },
    };
    expect(projectSchema.safeParse(p).success).toBe(true);
  });

  it("accepts lastVerified", () => {
    expect(
      projectSchema.safeParse({ ...validProject, lastVerified: "2026-08" })
        .success,
    ).toBe(true);
  });
});

/**
 * The runtime resolver handles an ordered locale chain, so the type must not
 * be the thing that stops a third locale. Key *shape* is all the schema can
 * police; whether "rp" is a real locale is a data question, checked against
 * the messages/ directory in data:validate.
 */
describe("localizedStringSchema", () => {
  it("requires a non-empty en", () => {
    expect(localizedStringSchema.safeParse({ ro: "x" }).success).toBe(false);
    expect(localizedStringSchema.safeParse({ en: "" }).success).toBe(false);
  });

  it("accepts any additional locale key, not just ro", () => {
    expect(
      localizedStringSchema.safeParse({
        en: "x",
        ro: "y",
        bg: "z",
        "ro-MD": "w",
      }).success,
    ).toBe(true);
  });

  it("still rejects a non-string or empty value under any locale", () => {
    expect(localizedStringSchema.safeParse({ en: "x", ro: 5 }).success).toBe(
      false,
    );
    expect(localizedStringSchema.safeParse({ en: "x", ro: "" }).success).toBe(
      false,
    );
    // The hole a plain non-strict object left: an unknown key was not
    // validated at all, so a locale added with a number in it passed.
    expect(localizedStringSchema.safeParse({ en: "x", bg: 5 }).success).toBe(
      false,
    );
    expect(localizedStringSchema.safeParse({ en: "x", bg: "" }).success).toBe(
      false,
    );
  });

  /**
   * Type-level, so it is tsc that fails rather than vitest: this is the
   * assignment that did not compile before, and the whole point of the
   * change. Kept as a value so the compiler actually checks it.
   */
  it("types a third locale without widening at the call site", () => {
    const german: LocalizedString = { en: "Motorway", de: "Autobahn" };
    const chained: LocalizedString = { en: "x", ro: "y", "ro-MD": "z" };
    expect(german.de).toBe("Autobahn");
    expect(chained["ro-MD"]).toBe("z");
  });
});

describe("reference tables for corridors, programmes and operators", () => {
  it("accepts a corridor table and rejects an unknown scheme", () => {
    const table = {
      note: "n",
      corridors: {
        "pan-european-iv": {
          scheme: "pan-european",
          name: { en: "Pan-European Corridor IV" },
          sources: [{ title: "T", url: "https://example.com/a" }],
        },
      },
    };
    expect(corridorTableSchema.safeParse(table).success).toBe(true);
    table.corridors["pan-european-iv"].scheme = "made-up";
    expect(corridorTableSchema.safeParse(table).success).toBe(false);
  });

  it("accepts a programme table", () => {
    expect(
      programmeTableSchema.safeParse({
        note: "n",
        programmes: {
          "ro-pnrr": {
            name: { en: "PNRR" },
            instrument: "grant",
            authority: "European Commission",
            period: "2021-2026",
            sources: [{ title: "T", url: "https://example.com/a" }],
          },
        },
      }).success,
    ).toBe(true);
  });

  it("accepts an operator table and rejects an unknown role", () => {
    const entry = {
      name: "CNAIR",
      country: "ro",
      role: "road_authority",
      sources: [{ title: "T", url: "https://example.com/a" }],
    };
    expect(
      operatorTableSchema.safeParse({
        note: "n",
        operators: { "ro-cnair": entry },
      }).success,
    ).toBe(true);
    expect(
      operatorTableSchema.safeParse({
        note: "n",
        operators: { "ro-cnair": { ...entry, role: "builder" } },
      }).success,
    ).toBe(false);
  });

  it("lets a project point at corridors and an operator", () => {
    expect(
      projectSchema.safeParse({
        ...validProject,
        corridors: ["pan-european-iv"],
        operator: "ro-cnair",
      }).success,
    ).toBe(true);
  });

  /**
   * partOf sits on the lot, not the project: ro-tunnels holds structures
   * inside A1, A3 and A8 sections, so a single project-level parent would
   * be false for most of its lots.
   */
  it("lets a lot name the project whose section contains it", () => {
    const lot = {
      id: "meses",
      name: { en: "Meseș tunnel" },
      status: "under_construction",
      lengthKm: 2.734,
      geometryRef: "meses",
    };
    expect(lotSchema.safeParse({ ...lot, partOf: "ro-a3" }).success).toBe(true);
    expect(lotSchema.safeParse({ ...lot, partOf: "A3" }).success).toBe(false);
  });
});

describe("funding programme attribution", () => {
  const lot = {
    id: "x",
    name: { en: "X" },
    status: "planned",
    lengthKm: 10,
    geometryRef: "x",
  };

  it("accepts a programme key, co-financing rate, amount and deadline", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        funding: [
          {
            source: "EU",
            programme: "ro-pnrr",
            coFinancingRate: 0.85,
            amount: { amount: 100, currency: "EUR", year: 2022 },
            deadline: "2026-08",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects a co-financing rate outside 0 to 1, which is a percent slip", () => {
    for (const rate of [85, -0.1, 1.5]) {
      expect(
        lotSchema.safeParse({
          ...lot,
          funding: [{ source: "EU", coFinancingRate: rate }],
        }).success,
      ).toBe(false);
    }
  });
});

describe("lot profile", () => {
  const lot = {
    id: "x",
    name: { en: "X" },
    status: "planned",
    lengthKm: 10,
    geometryRef: "x",
  };

  it("accepts terrain, works class and structure figures", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        profile: {
          terrain: "mountain",
          works: "greenfield",
          viaductKm: 3.2,
          tunnelKm: 1.5,
          bridgeCount: 12,
          lanes: 4,
          designSpeedKmh: 120,
          tolled: false,
          maxSpeedKmh: 160,
          electrified: true,
          tracks: 2,
          stationCount: 5,
        },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown terrain or works class", () => {
    expect(
      lotSchema.safeParse({ ...lot, profile: { terrain: "swamp" } }).success,
    ).toBe(false);
    expect(
      lotSchema.safeParse({ ...lot, profile: { works: "widening" } }).success,
    ).toBe(false);
  });

  it("rejects structure lengths longer than the lot itself", () => {
    expect(
      lotSchema.safeParse({ ...lot, lengthKm: 10, profile: { tunnelKm: 12 } })
        .success,
    ).toBe(false);
  });
});

/**
 * A real cost record is a chain: tender estimate, award, addendum, revised
 * budget, settlement. Only 3 of 212 lots carry both an estimate and an
 * outturn, so the overrun rankings run on three rows.
 */
describe("cost revisions", () => {
  const lot = {
    id: "x",
    name: { en: "X" },
    status: "opened",
    dates: { opened: "2020" },
    lengthKm: 10,
    geometryRef: "x",
  };

  it("accepts a dated chain of revisions", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        cost: {
          revisions: [
            {
              kind: "estimate",
              date: "2018-03",
              money: { amount: 100, currency: "EUR", year: 2018 },
            },
            {
              kind: "outturn",
              date: "2020-11",
              money: { amount: 130, currency: "EUR", year: 2020 },
              sourceRef: "hotnews-x",
            },
          ],
        },
      }).success,
    ).toBe(true);
  });

  it("requires a date on every revision, since undated is what we already had", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        cost: {
          revisions: [
            {
              kind: "outturn",
              money: { amount: 1, currency: "EUR", year: 2020 },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown revision kind", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        cost: {
          revisions: [
            {
              kind: "guess",
              date: "2020",
              money: { amount: 1, currency: "EUR", year: 2020 },
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("derives estimated and actual from the chain, newest of each kind", () => {
    const cost = {
      revisions: [
        {
          kind: "estimate" as const,
          date: "2018",
          money: { amount: 100, currency: "EUR", year: 2018 },
        },
        {
          kind: "revised_budget" as const,
          date: "2019",
          money: { amount: 115, currency: "EUR", year: 2019 },
        },
        {
          kind: "outturn" as const,
          date: "2020",
          money: { amount: 130, currency: "EUR", year: 2020 },
        },
      ],
    };
    expect(lotEstimatedCost({ cost })?.amount).toBe(100);
    expect(lotActualCost({ cost })?.amount).toBe(130);
  });

  it("prefers an explicit estimated/actual over the derived view", () => {
    const cost = {
      estimated: { amount: 90, currency: "EUR", year: 2018 },
      revisions: [
        {
          kind: "estimate" as const,
          date: "2018",
          money: { amount: 100, currency: "EUR", year: 2018 },
        },
      ],
    };
    expect(lotEstimatedCost({ cost })?.amount).toBe(90);
    expect(lotActualCost({ cost })).toBeNull();
  });
});

/**
 * `status` is one word for a history. Comarnic–Brașov was "tendered" with a
 * construction start date while 6.3 km of it had been open since December
 * 2020, and two cancelled procurements existed only in prose, which is why
 * no lot in 212 was ever `cancelled`.
 */
describe("lot events", () => {
  const lot = {
    id: "x",
    name: { en: "X" },
    status: "tendered",
    lengthKm: 10,
    geometryRef: "x",
  };

  it("accepts a dated history with source references", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        events: [
          { kind: "tender_launched", date: "2013", sourceRef: "wikipedia-a3" },
          {
            kind: "tender_cancelled",
            date: "2015",
            note: { en: "Concession to Vinci–Strabag–Aktor cancelled." },
          },
          { kind: "partial_opening", date: "2020-12" },
        ],
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown event kind", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        events: [{ kind: "delayed", date: "2020" }],
      }).success,
    ).toBe(false);
  });

  it("requires a date on every event", () => {
    expect(
      lotSchema.safeParse({ ...lot, events: [{ kind: "opened" }] }).success,
    ).toBe(false);
  });

  it("requires events in date order, so the history reads as one", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        events: [
          { kind: "tender_cancelled", date: "2015" },
          { kind: "tender_launched", date: "2013" },
        ],
      }).success,
    ).toBe(false);
  });

  it("allows two events on the same date", () => {
    expect(
      lotSchema.safeParse({
        ...lot,
        events: [
          { kind: "tender_cancelled", date: "2020" },
          { kind: "tender_launched", date: "2020" },
        ],
      }).success,
    ).toBe(true);
  });
});

describe("statusFromEvents", () => {
  it("reads the status the history implies", () => {
    expect(statusFromEvents([{ kind: "opened", date: "2020" }])).toBe("opened");
    expect(
      statusFromEvents([
        { kind: "tender_launched", date: "2013" },
        { kind: "tender_cancelled", date: "2015" },
      ]),
    ).toBe("cancelled");
    expect(
      statusFromEvents([
        { kind: "awarded", date: "2017" },
        { kind: "construction_start", date: "2018" },
      ]),
    ).toBe("under_construction");
    expect(statusFromEvents([{ kind: "announced", date: "2008" }])).toBe(
      "planned",
    );
  });

  it("lets a later event override an earlier one", () => {
    expect(
      statusFromEvents([
        { kind: "tender_cancelled", date: "2015" },
        { kind: "tender_launched", date: "2018" },
      ]),
    ).toBe("tendered");
    expect(
      statusFromEvents([
        { kind: "suspended", date: "1996" },
        { kind: "resumed", date: "2004" },
        { kind: "opened", date: "2008" },
      ]),
    ).toBe("opened");
  });

  it("treats a partial opening as not yet opened", () => {
    // The lot as a whole is still being built; only part is in service.
    expect(
      statusFromEvents([
        { kind: "construction_start", date: "2017" },
        { kind: "partial_opening", date: "2020-12" },
      ]),
    ).toBe("under_construction");
  });

  it("returns null when no event carries status meaning", () => {
    expect(statusFromEvents([])).toBeNull();
    expect(statusFromEvents([{ kind: "litigation", date: "2020" }])).toBeNull();
  });
});

describe("helpers", () => {
  it("dateYear extracts the year from all supported formats", () => {
    expect(dateYear("2012")).toBe(2012);
    expect(dateYear("2012-06")).toBe(2012);
    expect(dateYear("2012-06-15")).toBe(2012);
  });

  it("projectGeoPath maps project id to its geojson path", () => {
    const p = projectSchema.parse(validProject);
    expect(projectGeoPath(p)).toBe("data/geo/ro/a1.geojson");
  });
});
